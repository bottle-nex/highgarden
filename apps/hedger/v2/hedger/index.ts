import { Queue, Worker, QueueEvents } from "bullmq";
import { AnchorProvider, type Wallet as AnchorWallet } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/esm/nodewallet.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SolmarketClient } from "@solmarket/contract";
import bs58 from "bs58";

import { ENV } from "../envs/env";
import { logger_for } from "../log/log";
import { make_redis_options } from "../redis";
import type SolanaClient from "../clients/solana";
import type PolymarketClient from "../clients/polymarket";
import Hedge from "../db/hedge";
import Exposure from "../db/exposure";
import Fill from "../db/fill";
import type { OrderFilledEvent } from "../ingest/decoder";
import HedgeProcessor from "./processor";
import type { HedgeJobData, HedgeJobResult } from "./types";

const QUEUE_NAME = "hedge-orders-v2";
const JOB_NAME = "hedge";

/** Job-completion / failure cleanup. Kept as constants — not env knobs — because tuning these doesn't change between environments. */
const COMPLETE_AGE_SEC = 86_400;
const COMPLETE_COUNT = 1_000;
const FAIL_AGE_SEC = 30 * 86_400;
const FAIL_COUNT = 5_000;

/**
 * The complete v2 Hedger service: producer, worker, queue-events
 * listener, boot recovery, and auto-pause-on-permanent-failure all
 * folded into one class. From the outside this is a small surface —
 * `on_fill(event, ctx)` to enqueue, `start()` / `stop()` for lifecycle.
 *
 * What's encapsulated as private (vs v1's separate top-level classes):
 *
 *   - Producer queue. v1 had `HedgeQueueProducer`.
 *   - Worker pulling jobs through `HedgeProcessor`. v1 had `HedgeWorker`.
 *   - Queue events listener for permanent-failure callbacks. v1 had `HedgeQueueEvents`.
 *   - Boot recovery for hedges left HEDGING from a prior crash. v1 had `BootRecovery`.
 *   - Auto-pause via on-chain admin tx. v1 had `HedgerAdminTxSubmitter`.
 *
 * Each of those was justified in v1 by separate testing concerns; in
 * v2 they're internal to the one entity that owns the hedging
 * lifecycle, and the composition root sees `new Hedger(...)` only.
 */
export default class Hedger {
    private readonly log = logger_for("hedger");
    private readonly solana: SolanaClient;
    private readonly processor: HedgeProcessor;
    private readonly queue: Queue<HedgeJobData>;
    private worker: Worker<HedgeJobData, HedgeJobResult> | null = null;
    private events: QueueEvents | null = null;
    private admin_keypair: Keypair | null = null;
    private admin_client: SolmarketClient | null = null;
    private warned_pause_disabled = false;
    private closing = false;

    constructor(solana: SolanaClient, poly: PolymarketClient) {
        this.solana = solana;
        this.processor = new HedgeProcessor(poly);
        this.queue = new Queue<HedgeJobData>(QUEUE_NAME, {
            connection: make_redis_options(),
            defaultJobOptions: {
                attempts: ENV.HEDGER_JOB_ATTEMPTS,
                backoff: { type: "exponential", delay: ENV.HEDGER_JOB_BACKOFF_DELAY_MS },
                removeOnComplete: { age: COMPLETE_AGE_SEC, count: COMPLETE_COUNT },
                removeOnFail: { age: FAIL_AGE_SEC, count: FAIL_COUNT },
            },
        });
    }

    // ──────────────── Lifecycle ────────────────

    /**
     * Boots the hedger:
     *   1. Run boot recovery — reset any HEDGING rows from a prior crash.
     *   2. Start the worker so jobs are pulled.
     *   3. Attach queue-events for the auto-pause callback on permanent
     *      failure.
     *
     * The producer queue is constructed eagerly in the constructor so
     * `on_fill` can be called before `start()` returns (e.g. during boot
     * smoke).
     */
    public async start(): Promise<void> {
        this.closing = false;
        await this.recover_in_flight();
        this.attach_worker();
        this.attach_queue_events();
        this.log.info("hedger up");
    }

    /**
     * Tears down the worker, queue-events, and queue in dependency order.
     * Force-close the worker so in-flight jobs don't block on a Redis
     * socket that's already being torn down — boot recovery on the next
     * start handles anything that was mid-flight.
     */
    public async stop(): Promise<void> {
        this.closing = true;
        await this.worker?.close(true);
        await this.events?.close();
        await this.queue.close();
    }

    // ──────────────── Producer (called by FillIngester.on_fill) ────────────────

    /**
     * Enqueues a hedge job for one observed `OrderFilled` event. The
     * BullMQ job id is set to the hex nonce — Solana guarantees nonces
     * are unique per fill, so this gives us free dedupe across the
     * listener, poller, recovery, and reconciler all routing through
     * here. The first writer wins; subsequent calls observe `existing`
     * and return without enqueueing.
     *
     * Source is recorded on the payload purely for ops triage.
     */
    public async on_fill(
        event: OrderFilledEvent,
        ctx: { signature: string; slot: bigint; source: "live" | "poller" | "recovery" },
    ): Promise<void> {
        const job_id = event.nonce.toString("hex");
        const existing = await this.queue.getJob(job_id);
        if (existing) {
            this.log.debug({ job_id, source: ctx.source }, "duplicate, skipping");
            return;
        }
        await this.queue.add(JOB_NAME, this.build_payload(event, ctx), { jobId: job_id });
        this.log.info(
            { job_id, market: event.market.toBase58(), source: ctx.source },
            "enqueued hedge job",
        );
    }

    private build_payload(
        event: OrderFilledEvent,
        ctx: { signature: string; slot: bigint; source: "live" | "poller" | "recovery" },
    ): HedgeJobData {
        return {
            event: {
                user: event.user.toBase58(),
                market: event.market.toBase58(),
                polymarketMarketId: event.polymarketMarketId,
                side: event.side,
                outcome: event.outcome,
                size: event.size.toString(),
                price: event.price,
                nonceHex: event.nonce.toString("hex"),
            },
            source: ctx.source,
            signature: ctx.signature,
            slot: Number(ctx.slot),
            enqueuedAt: Date.now(),
        };
    }

    // ──────────────── Worker ────────────────

    private attach_worker(): void {
        this.worker = new Worker<HedgeJobData, HedgeJobResult>(
            QUEUE_NAME,
            (job) => this.processor.handle(job),
            {
                connection: make_redis_options(),
                concurrency: ENV.HEDGER_WORKER_CONCURRENCY,
                limiter: {
                    max: ENV.HEDGER_WORKER_RATE_LIMIT_MAX,
                    duration: ENV.HEDGER_WORKER_RATE_LIMIT_MS,
                },
            },
        );

        this.worker.on("ready", () => this.log.info("hedge worker ready"));
        this.worker.on("error", (err) => {
            if (this.is_shutdown_noise(err)) return;
            this.log.error({ err }, "worker error");
        });
        this.worker.on("failed", (job, err) => {
            this.log.error(
                { jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message },
                "job failed",
            );
        });
        this.worker.on("completed", (job, result) => {
            this.log.info({ jobId: job.id, result }, "job completed");
        });
    }

    /**
     * BullMQ throws `ETIMEDOUT` / `ECONNREFUSED` / `ECONNRESET` during
     * graceful close as the socket teardown races outstanding commands.
     * These aren't real errors — silence them so logs aren't noisy at
     * shutdown.
     */
    private is_shutdown_noise(err: unknown): boolean {
        if (!this.closing) return false;
        const code = (err as { code?: string })?.code;
        return code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "ECONNRESET";
    }

    // ──────────────── QueueEvents (permanent failure → auto-pause) ────────────────

    private attach_queue_events(): void {
        this.events = new QueueEvents(QUEUE_NAME, { connection: make_redis_options() });

        this.events.on("failed", ({ jobId, failedReason }) => {
            void this.on_permanent_failure(jobId, failedReason);
        });
        this.events.on("stalled", ({ jobId }) => {
            this.log.warn({ jobId }, "job stalled");
        });
        this.events.on("completed", ({ jobId }) => {
            this.log.debug({ jobId }, "job completed (queue-events)");
        });
    }

    /**
     * Called when BullMQ has exhausted retries on a job. Marks the hedge
     * FAILED and — if the admin keypair is configured — pauses the
     * market on-chain to prevent further fills against an unhedgeable
     * market.
     *
     * "Permanent" here means BullMQ exhausted its retries; that may
     * include retryable errors that just kept failing. Auto-pause is the
     * conservative response: stop accepting new orders until ops looks.
     */
    private async on_permanent_failure(job_id: string, reason: string): Promise<void> {
        this.log.error({ jobId: job_id, reason }, "queue declared job failed");
        await this.mark_hedge_failed(job_id, reason);
        await this.maybe_pause_market(job_id, reason);
    }

    private async mark_hedge_failed(job_id: string, reason: string): Promise<void> {
        try {
            const hedge = await Hedge.find_by_bull_job_id(job_id);
            if (!hedge) return;
            if (hedge.status === "FAILED") return;
            await Hedge.mark_failed(hedge.id, reason);
        } catch (err) {
            this.log.error({ err, jobId: job_id }, "mark_hedge_failed threw");
        }
    }

    // ──────────────── Auto-pause on permanent failure ────────────────

    private async maybe_pause_market(job_id: string, reason: string): Promise<void> {
        if (!ENV.HEDGER_SOLANA_ADMIN_KEYPAIR) {
            if (!this.warned_pause_disabled) {
                this.log.warn(
                    "auto-pause disabled — set HEDGER_SOLANA_ADMIN_KEYPAIR to enable pausing markets after permanent hedge failures",
                );
                this.warned_pause_disabled = true;
            }
            return;
        }
        try {
            const ctx = await this.lookup_pause_context(job_id);
            if (!ctx) return;
            const sig = await this.pause_market_on_chain(ctx.solanaMarketPda);
            await Exposure.set_paused(ctx.marketId, true);
            this.log.warn(
                {
                    jobId: job_id,
                    marketId: ctx.marketId,
                    marketPda: ctx.solanaMarketPda,
                    txSig: sig,
                    reason,
                },
                ">>> AUTO-PAUSE: market paused after permanent job failure",
            );
        } catch (err) {
            this.log.error({ err, jobId: job_id }, "auto-pause failed");
        }
    }

    /**
     * Walks the failed job back to the on-chain market PDA via
     * `BullJob → Hedge → Fill → Market`. Returns null when any link is
     * broken; the caller logs and moves on (auto-pause is best-effort).
     */
    private async lookup_pause_context(
        job_id: string,
    ): Promise<{ marketId: string; solanaMarketPda: string } | null> {
        const ctx = await Hedge.find_pause_context_by_job_id(job_id);
        if (!ctx) {
            this.log.warn({ jobId: job_id }, "could not resolve market PDA for auto-pause");
            return null;
        }
        return ctx;
    }

    /**
     * Submits the on-chain pause instruction. Lazily constructs the
     * SolmarketClient + admin keypair on first call so the dependency
     * graph stays simple in `init.services.ts`.
     *
     * The keypair env can be either a JSON byte array (Solana CLI export
     * format, `[1,2,3,...]`) or a base58 string — both are accepted.
     */
    private async pause_market_on_chain(market_pda: string): Promise<string> {
        const client = this.get_admin_client();
        const admin = this.get_admin_keypair();
        return client.adminPauseMarket({
            admin: admin.publicKey,
            market: new PublicKey(market_pda),
        });
    }

    private get_admin_client(): SolmarketClient {
        if (!this.admin_client) {
            // Use a dedicated Connection so the admin tx path doesn't share
            // commitment / preflight settings with the listener's RPC.
            const connection = new Connection(ENV.HEDGER_SOLANA_RPC_URL, "confirmed");
            const wallet = new NodeWallet(this.get_admin_keypair()) as unknown as AnchorWallet;
            const provider = new AnchorProvider(connection, wallet, {
                commitment: "confirmed",
                preflightCommitment: "confirmed",
            });
            this.admin_client = new SolmarketClient(provider);
        }
        return this.admin_client;
    }

    private get_admin_keypair(): Keypair {
        if (!this.admin_keypair) {
            this.admin_keypair = this.load_keypair(ENV.HEDGER_SOLANA_ADMIN_KEYPAIR!);
        }
        return this.admin_keypair;
    }

    private load_keypair(encoded: string): Keypair {
        const trimmed = encoded.trim();
        if (trimmed.startsWith("[")) {
            const arr = JSON.parse(trimmed) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        return Keypair.fromSecretKey(bs58.decode(trimmed));
    }

    // ──────────────── Boot recovery (was BootRecovery) ────────────────

    /**
     * Runs on every boot. Two responsibilities:
     *
     *   1. Reset any hedges left in HEDGING from a prior crash to PENDING
     *      so BullMQ can retry. Without this, a crash mid-attempt leaves
     *      the row in HEDGING forever and the worker's `is_terminal`
     *      check would never return SKIPPED — but more importantly, the
     *      attempts counter and clientOrderId would be stale.
     *
     *   2. Recompute total unhedged exposure per market from `Fill +
     *      Hedge` rows and reconcile against the cached `Exposure.unhedgedUsd`.
     *      Drift > $1 triggers a corrective overwrite plus a warn log.
     *      This is the "did we leak exposure during a crash" check.
     *
     * Logged but not blocking: if recovery throws, start() still
     * proceeds. The system was running fine before the crash; recovery
     * is a best-effort cleanup, not a gate.
     */
    private async recover_in_flight(): Promise<void> {
        this.log.info("starting boot recovery");
        try {
            await this.recover_stuck_hedging();
            await this.rebuild_exposure_drift_check();
            this.log.info("boot recovery complete");
        } catch (err) {
            this.log.error({ err }, "boot recovery failed (continuing)");
        }
    }

    private async recover_stuck_hedging(): Promise<void> {
        const stuck = await Hedge.list_all_in_hedging();
        if (stuck.length === 0) return;
        this.log.warn({ count: stuck.length }, "found hedges stuck in HEDGING from a prior crash");
        for (const row of stuck) {
            await Hedge.reset_to_pending(row.id);
            this.log.warn(
                {
                    hedgeId: row.id,
                    fillId: row.fillId,
                    clientOrderId: row.clientOrderId,
                    priorAttempts: row.attempts,
                },
                "reset stuck HEDGING row to PENDING; BullMQ will retry",
            );
        }
    }

    private async rebuild_exposure_drift_check(): Promise<void> {
        const expected = await this.compute_expected_exposure();
        const exposures = await Exposure.list_all();
        for (const ex of exposures) {
            await this.reconcile_one_exposure(ex, expected.get(ex.marketId) ?? 0);
        }
    }

    private async compute_expected_exposure(): Promise<Map<string, number>> {
        const fills = await Fill.list_with_hedge_status();
        const expected = new Map<string, number>();
        for (const f of fills) {
            if (this.is_hedge_terminal(f.hedge?.status)) continue;
            // Signed USD notional. BUY adds (we owe shares),
            // SELL subtracts (we hold excess shares).
            const magnitude = Math.round((f.price * f.size) / 100);
            const signed = f.side === "BUY" ? magnitude : -magnitude;
            expected.set(f.marketId, (expected.get(f.marketId) ?? 0) + signed);
        }
        return expected;
    }

    private is_hedge_terminal(status: string | null | undefined): boolean {
        return status === "FILLED" || status === "PARTIAL" || status === "FAILED";
    }

    private async reconcile_one_exposure(
        exposure: { marketId: string; unhedgedUsd: number },
        recomputed: number,
    ): Promise<void> {
        if (Math.abs(exposure.unhedgedUsd - recomputed) <= 1) return;
        this.log.warn(
            { marketId: exposure.marketId, stored: exposure.unhedgedUsd, recomputed },
            "exposure drift detected — correcting",
        );
        await Exposure.set_unhedged_usd(exposure.marketId, recomputed);
    }
}
