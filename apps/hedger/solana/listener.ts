import type { Connection, Logs } from "@solana/web3.js";
import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";
import SolanaConnectionFactory from "./connection";
import OrderFilledDecoder, { type OrderFilledEvent } from "./decoder";
import CursorRepo from "../db/cursor.repo";

export type OnOrderFilled = (
    _event: OrderFilledEvent,
    _context: { signature: string; slot: number; source: "live" },
) => Promise<void> | void;

export default class LiveListener {
    private readonly log = LoggerFactory.for_category("listener");
    private readonly rpc: Connection;
    private readonly decoder: OrderFilledDecoder;
    private readonly cursor: CursorRepo;
    private readonly handler: OnOrderFilled;
    private subscription_id: number | null = null;
    private reconnect_handle: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;

    constructor(handler: OnOrderFilled, cursor: CursorRepo) {
        this.rpc = SolanaConnectionFactory.get_rpc();
        this.decoder = new OrderFilledDecoder();
        this.cursor = cursor;
        this.handler = handler;
    }

    public async start(): Promise<void> {
        this.stopped = false;
        await this.subscribe();
    }

    public async stop(): Promise<void> {
        this.stopped = true;
        if (this.reconnect_handle) {
            clearTimeout(this.reconnect_handle);
            this.reconnect_handle = null;
        }
        if (this.subscription_id !== null) {
            try {
                await this.rpc.removeOnLogsListener(this.subscription_id);
            } catch (err) {
                this.log.warn({ err }, "removeOnLogsListener failed");
            }
            this.subscription_id = null;
        }
    }

    private async subscribe(): Promise<void> {
        const program_id = SolanaConnectionFactory.get_program_id();
        try {
            this.subscription_id = this.rpc.onLogs(
                program_id,
                (logs: Logs, ctx: { slot: number }) =>
                    void this.handle_logs(logs, ctx.slot),
                ENV.HEDGER_SOLANA_COMMITMENT,
            );
            await this.cursor.record_live_connected();
            this.log.info({ programId: program_id.toBase58() }, "live listener connected");
        } catch (err) {
            this.log.error({ err }, "subscribe failed; scheduling reconnect");
            this.schedule_reconnect();
        }
    }

    private async handle_logs(logs: Logs, slot: number): Promise<void> {
        if (logs.err) return;
        if (!logs.logs || logs.logs.length === 0) return;

        const events = this.decoder.decode_logs(logs.logs);
        if (events.length === 0) return;

        for (const ev of events) {
            try {
                await this.handler(ev, {
                    signature: logs.signature,
                    slot,
                    source: "live",
                });
            } catch (err) {
                this.log.error(
                    { err, signature: logs.signature },
                    "handler threw on live event",
                );
            }
        }
    }

    private schedule_reconnect(): void {
        if (this.stopped || this.reconnect_handle) return;
        this.reconnect_handle = setTimeout(() => {
            this.reconnect_handle = null;
            void this.cursor.record_live_disconnected().catch(() => {});
            void this.subscribe();
        }, ENV.HEDGER_LIVE_LISTENER_RECONNECT_MS);
    }
}
