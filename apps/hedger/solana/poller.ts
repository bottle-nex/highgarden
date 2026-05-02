import type { Connection, ConfirmedSignatureInfo, Finality } from "@solana/web3.js";
import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";
import SolanaConnectionFactory from "./connection";
import OrderFilledDecoder, { type OrderFilledEvent } from "./decoder";
import CursorRepo from "../db/cursor.repo";

export type OnOrderFilledFromPoller = (
    event: OrderFilledEvent,
    context: { signature: string; slot: number; source: "poller" },
) => Promise<void> | void;

export default class CatchUpPoller {
    private readonly log = LoggerFactory.for_category("poller");
    private readonly rpc: Connection;
    private readonly decoder: OrderFilledDecoder;
    private readonly cursor: CursorRepo;
    private readonly handler: OnOrderFilledFromPoller;
    private interval_handle: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(handler: OnOrderFilledFromPoller, cursor: CursorRepo) {
        this.rpc = SolanaConnectionFactory.get_rpc();
        this.decoder = new OrderFilledDecoder();
        this.cursor = cursor;
        this.handler = handler;
    }

    public start(): void {
        if (this.interval_handle) return;
        void this.tick();
        this.interval_handle = setInterval(
            () => void this.tick(),
            ENV.HEDGER_POLLER_INTERVAL_MS,
        );
    }

    public stop(): void {
        if (this.interval_handle) {
            clearInterval(this.interval_handle);
            this.interval_handle = null;
        }
    }

    private async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.run_once();
            await this.cursor.record_poller_run();
        } catch (err) {
            this.log.error({ err }, "poller tick failed");
        } finally {
            this.running = false;
        }
    }

    private async run_once(): Promise<void> {
        const cursor = await this.cursor.load();
        const signatures = await this.fetch_new_signatures(cursor.lastProcessedSignature);
        if (signatures.length === 0) return;

        const ordered = [...signatures].reverse();
        for (const sig of ordered) {
            await this.process_signature(sig);
        }
    }

    private async fetch_new_signatures(
        until: string | null,
    ): Promise<ConfirmedSignatureInfo[]> {
        const program_id = SolanaConnectionFactory.get_program_id();
        return this.rpc.getSignaturesForAddress(
            program_id,
            {
                limit: ENV.HEDGER_MAX_BACKFILL_SIGNATURES,
                ...(until ? { until } : {}),
            },
            this.finality(),
        );
    }

    private finality(): Finality {
        return ENV.HEDGER_SOLANA_COMMITMENT === "processed"
            ? "confirmed"
            : (ENV.HEDGER_SOLANA_COMMITMENT as Finality);
    }

    private async process_signature(sig: ConfirmedSignatureInfo): Promise<void> {
        if (sig.err) {
            await this.cursor.record_signature(sig.signature, BigInt(sig.slot));
            return;
        }

        const tx = await this.rpc.getTransaction(sig.signature, {
            commitment: this.finality(),
            maxSupportedTransactionVersion: 0,
        });
        const logs = tx?.meta?.logMessages ?? [];
        const events = this.decoder.decode_logs(logs);

        for (const ev of events) {
            try {
                await this.handler(ev, {
                    signature: sig.signature,
                    slot: sig.slot,
                    source: "poller",
                });
            } catch (err) {
                this.log.error(
                    { err, signature: sig.signature },
                    "handler threw on poller event",
                );
            }
        }

        await this.cursor.record_signature(sig.signature, BigInt(sig.slot));
    }
}
