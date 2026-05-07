import { logger_for } from "../log/log";
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

<<<<<<< HEAD
    public async start(): Promise<void> {
        await this.cursor.load();
        this.listener = new Listener(
            this.solana,
            this.decoder,
            this.cursor,
            this.on_fill,
            this.health,
        );
        this.poller = new Poller(this.solana, this.decoder, this.cursor, this.on_fill, this.health);
        await this.listener.start();
        this.poller.start();
        this.log.info("ingester up");
    }
=======
  public async start(): Promise<void> {
    await this.cursor.load();
    this.listener = new Listener(this.solana, this.decoder, this.cursor, this.on_fill, this.health);
    this.poller = new Poller(this.solana, this.decoder, this.cursor, this.on_fill, this.health);
    await this.listener.start();
    this.poller.start();
    this.log.info("ingester up");
  }
>>>>>>> 3dbfc24 (fixed dashboard and event uis)

  public async stop(): Promise<void> {
    this.poller?.stop();
    await this.listener?.stop();
  }
}
