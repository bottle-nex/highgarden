import type { ConfirmedSignatureInfo, Finality } from "@solana/web3.js";
import { ENV } from "../envs/env";
import { logger_for } from "../log/log";
import type SolanaClient from "../clients/solana";
import type OrderFilledDecoder from "./decoder";
import type Cursor from "../db/cursor";
import type { FillHandler } from "./listener";
import type HealthServer from "../health";

/**
 * Periodically scans the on-chain signature history for the program and
 * replays any signatures newer than the cursor through the same handler
 * the listener uses. This is the *catch-up* path — slower than the live
 * listener but authoritative for cursor advancement.
 *
 * Why both: the websocket can drop without notice (RPC restarts, network
 * blips, idle timeouts). The poller guarantees that any fill the live
 * listener missed eventually reaches the handler, at the cost of a one-
 * tick delay. The hedger's nonce-keyed queue dedupe makes "see same fill
 * twice" cheap.
 *
 * Single-flight: each tick checks `running` and returns early if a
 * previous tick is still in flight. This prevents tick stacking when an
 * RPC slowdown makes a tick exceed the configured interval.
 */
export default class Poller {
    private readonly log = logger_for("poller");
    private readonly solana: SolanaClient;
    private readonly decoder: OrderFilledDecoder;
    private readonly cursor: Cursor;
    private readonly on_fill: FillHandler;
    private readonly health: HealthServer;
    private interval_handle: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(
        solana: SolanaClient,
        decoder: OrderFilledDecoder,
        cursor: Cursor,
        on_fill: FillHandler,
        health: HealthServer,
    ) {
        this.solana = solana;
        this.decoder = decoder;
        this.cursor = cursor;
        this.on_fill = on_fill;
        this.health = health;
    }

    /**
     * Kicks off an immediate first tick (so a fresh boot doesn't wait the
     * full interval before catching up) and then schedules the periodic
     * interval. Idempotent — re-calling start while already running is a
     * no-op.
     */
    public start(): void {
        if (this.interval_handle) return;
        void this.tick();
        this.interval_handle = setInterval(() => void this.tick(), ENV.HEDGER_POLLER_INTERVAL_MS);
    }

    public stop(): void {
        if (this.interval_handle) {
            clearInterval(this.interval_handle);
            this.interval_handle = null;
        }
    }

    /**
     * Single-flight wrapper around {@link run_once}. We always update
     * `pollerLastRunAt` even if the run threw, so ops can distinguish "no
     * tick happened" (cursor.pollerLastRunAt is stale) from "tick keeps
     * failing" (pollerLastRunAt is fresh but logs show errors).
     */
    private async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.run_once();
        } catch (err) {
            this.log.error({ err }, "poller tick failed");
        } finally {
            try {
                await this.cursor.mark_poller_run();
            } catch (err) {
                this.log.warn({ err }, "mark_poller_run failed");
            }
            this.running = false;
        }
    }

    /**
     * Fetches every signature newer than the cursor and replays each in
     * chronological order. `getSignaturesForAddress` returns newest-first;
     * we reverse so the cursor advances monotonically as we process.
     */
    private async run_once(): Promise<void> {
        const since = this.cursor.get_signature();
        const signatures = await this.fetch_new_signatures(since);
        if (signatures.length === 0) return;

        const ordered = [...signatures].reverse();
        for (const sig of ordered) {
            await this.process_signature(sig);
        }
    }

    /**
     * Calls `getSignaturesForAddress` with the cursor as the lower bound.
     * `until` means "stop when you reach this signature" — combined with
     * `limit`, it gives "everything newer than the cursor, up to N most
     * recent." The first ever boot has `until=null` and pulls the most
     * recent N regardless.
     */
    private async fetch_new_signatures(until: string | null): Promise<ConfirmedSignatureInfo[]> {
        return this.solana.connection.getSignaturesForAddress(
            this.solana.program_id,
            {
                limit: ENV.HEDGER_MAX_BACKFILL_SIGNATURES,
                ...(until ? { until } : {}),
            },
            this.finality(),
        );
    }

    /**
     * `getTransaction` requires a `Finality` ("confirmed" | "finalized");
     * the commitment env can also be "processed" which is invalid here, so
     * we downgrade processed → confirmed.
     */
    private finality(): Finality {
        return ENV.HEDGER_SOLANA_COMMITMENT === "processed"
            ? "confirmed"
            : (ENV.HEDGER_SOLANA_COMMITMENT as Finality);
    }

    /**
     * Processes a single signature: fetches the full transaction, decodes
     * its logs, and dispatches each decoded fill through the handler.
     *
     * The cursor is advanced *after* handler dispatch — even if a single
     * event's handler threw. Rationale: BullMQ is the authority on retry,
     * not the cursor; refusing to advance would just cause the next tick
     * to redeliver the same signature and produce a duplicate enqueue
     * (no-op via nonce dedupe).
     *
     * Failed transactions (`sig.err !== null`) skip the decode entirely
     * but the cursor still advances past them — there's no fill to hedge
     * in a reverted tx.
     */
    private async process_signature(sig: ConfirmedSignatureInfo): Promise<void> {
        if (sig.err) {
            await this.cursor.advance(BigInt(sig.slot), sig.signature);
            return;
        }

        const tx = await this.solana.connection.getTransaction(sig.signature, {
            commitment: this.finality(),
            maxSupportedTransactionVersion: 0,
        });
        const logs = tx?.meta?.logMessages ?? [];
        const events = this.decoder.decode_logs(logs);

        if (events.length > 0) this.health.mark_event();

        for (const ev of events) {
            try {
                await this.on_fill(ev, {
                    signature: sig.signature,
                    slot: BigInt(sig.slot),
                    source: "poller",
                });
            } catch (err) {
                this.log.error({ err, signature: sig.signature }, "handler threw on poller event");
            }
        }

        await this.cursor.advance(BigInt(sig.slot), sig.signature);
    }
}
