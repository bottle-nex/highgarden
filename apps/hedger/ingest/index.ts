import { logger_for } from "../log/log";
import { ENV } from "../envs/env";
import type SolanaClient from "../clients/solana";
import type HealthServer from "../health";
import Cursor from "../db/cursor";
import OrderFilledDecoder from "./decoder";
import Listener, { type FillHandler } from "./listener";
import Poller from "./poller";

export type { FillHandler } from "./listener";
export type { OrderFilledEvent } from "./decoder";

/**
 * The composed Solana ingestion pipeline: cursor + decoder + live
 * listener + catch-up poller. From the outside, only `FillIngester` is
 * visible — Listener / Poller / Cursor / Decoder are internal mechanics
 * encapsulated here. Anything that wants a fill plugs in via the
 * `FillHandler` callback passed to the constructor.
 *
 * Lifecycle: `start()` loads the cursor (so the poller has a checkpoint
 * to resume from) and then brings up the listener and poller. The
 * listener is awaited because its initial subscribe is the gate for
 * `liveStreamConnectedAt`; the poller's `start()` is sync (it just
 * installs an interval).
 *
 * `stop()` tears down in reverse: poller first (stop scheduling new
 * ticks) and then listener (close the websocket). The cursor itself
 * holds no resources to release.
 */
export default class FillIngester {
    private readonly log = logger_for("ingest");
    private readonly solana: SolanaClient;
    private readonly on_fill: FillHandler;
    private readonly health: HealthServer;
    private readonly cursor: Cursor;
    private readonly decoder: OrderFilledDecoder;
    private listener: Listener | null = null;
    private poller: Poller | null = null;

    constructor(solana: SolanaClient, on_fill: FillHandler, health: HealthServer) {
        this.solana = solana;
        this.on_fill = on_fill;
        this.health = health;
        this.cursor = new Cursor();
        this.decoder = new OrderFilledDecoder(solana);
    }

    public async start(): Promise<void> {
        await this.cursor.load();
        // Poller always runs — it's the safety net regardless of whether
        // hedges are driven by the live listener (legacy) or by apps/server
        // synchronously (PR 2/5 hedge-first orchestration).
        this.poller = new Poller(this.solana, this.decoder, this.cursor, this.on_fill, this.health);
        this.poller.start();

        if (ENV.HEDGER_LIVE_LISTENER_ENABLED) {
            this.listener = new Listener(
                this.solana,
                this.decoder,
                this.cursor,
                this.on_fill,
                this.health,
            );
            await this.listener.start();
            this.log.info("ingester up (listener: live, poller: catchup)");
        } else {
            this.log.warn(
                "HEDGER_LIVE_LISTENER_ENABLED=false — running in safety-net-only mode. " +
                    "OrderFilled events should be driven by the server's hedge-first endpoint; " +
                    "any events seen by the poller imply a server-side crash mid-flow.",
            );
            // Mark health as "live-connected" anyway so /healthz doesn't 503
            // when the listener is intentionally off. The poller's
            // mark_event() will gate the offline-grace check.
            this.health.mark_live(true);
            this.log.info("ingester up (listener: disabled, poller: catchup)");
        }
    }

    public async stop(): Promise<void> {
        this.poller?.stop();
        await this.listener?.stop();
    }
}
