import type { Logs } from "@solana/web3.js";
import { ENV } from "../envs/env";
import { logger_for } from "../log/log";
import type SolanaClient from "../clients/solana";
import type OrderFilledDecoder from "./decoder";
import type { OrderFilledEvent } from "./decoder";
import type Cursor from "./cursor";
import type HealthServer from "../health";

/**
 * Callback signature shared by the live listener and the catch-up poller.
 * `source` lets the consumer (Hedger.on_fill) tell whether a fill came in
 * via websocket or backfill — useful for metrics and for log triage when
 * the same fill is observed twice (the queue's nonce-id dedupe makes the
 * duplicate enqueue a no-op).
 *
 * `slot` is `bigint` even though the underlying RPC types are `number`,
 * because Solana slots are `u64` and the cursor stores them as bigint.
 * Keeping the boundary type bigint keeps every downstream math operation
 * on safe ground.
 */
export type FillHandler = (
  _event: OrderFilledEvent,
  _ctx: { signature: string; slot: bigint; source: "live" | "poller" },
) => Promise<void> | void;

/**
 * Subscribes to Solana program logs over the RPC websocket and dispatches
 * decoded `OrderFilled` events to a handler. This is the *fast path* —
 * latency-optimized but not authoritative for cursor advancement; the
 * poller is what owns the cursor (see `Poller.process_signature`). If
 * the listener processes a fill, the next poller tick will redundantly
 * see the same signature; the queue's nonce-keyed dedupe makes that
 * safe.
 *
 * Reconnect is handled in-class with a `setTimeout` — we don't pull in
 * a websocket library or framework. If `subscribe()` throws (RPC down,
 * auth failure, etc.) the listener schedules a retry after
 * `HEDGER_LIVE_LISTENER_RECONNECT_MS` and logs at error. `stop()`
 * cancels any pending reconnect.
 */
export default class Listener {
  private readonly log = logger_for("listener");
  private readonly solana: SolanaClient;
  private readonly decoder: OrderFilledDecoder;
  private readonly cursor: Cursor;
  private readonly on_fill: FillHandler;
  private readonly health: HealthServer;
  private subscription_id: number | null = null;
  private reconnect_handle: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

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
   * Begins the websocket subscription. Marks the cursor live-connected
   * on success (so ops queries on `BotCursor.liveStreamConnectedAt`
   * reflect reality) and schedules a reconnect on failure.
   */
  public async start(): Promise<void> {
    this.stopped = false;
    await this.subscribe();
  }

  /**
   * Tears down the subscription and cancels any pending reconnect.
   * Tolerates double-stop and stop-before-start.
   */
  public async stop(): Promise<void> {
    this.stopped = true;
    this.health.mark_live(false);
    if (this.reconnect_handle) {
      clearTimeout(this.reconnect_handle);
      this.reconnect_handle = null;
    }
    if (this.subscription_id !== null) {
      try {
        await this.solana.connection.removeOnLogsListener(this.subscription_id);
      } catch (err) {
        this.log.warn({ err }, "removeOnLogsListener failed");
      }
      this.subscription_id = null;
    }
  }

  /**
   * Opens the `onLogs` subscription. Every notification is funneled
   * through {@link handle_logs}. We treat any throw from the RPC layer
   * (e.g. websocket drop during subscribe) as a transient condition
   * and schedule a retry rather than crashing the process.
   */
  private async subscribe(): Promise<void> {
    try {
      this.subscription_id = this.solana.connection.onLogs(
        this.solana.program_id,
        (logs: Logs, ctx: { slot: number }) => void this.handle_logs(logs, ctx.slot),
        ENV.HEDGER_SOLANA_COMMITMENT,
      );
      await this.cursor.mark_live_connected();
      this.health.mark_live(true);
      this.log.info(
        { program_id: this.solana.program_id.toBase58() },
        "live listener connected",
      );
    } catch (err) {
      this.health.mark_live(false);
      this.log.error({ err }, "subscribe failed; scheduling reconnect");
      this.schedule_reconnect();
    }
  }

  /**
   * Invoked for every log notification from the RPC. Filters out failed
   * transactions and empty payloads, hands the rest to the decoder, and
   * dispatches each decoded event to the handler.
   *
   * Handler errors are logged and swallowed: a single bad fill must not
   * tear down the websocket subscription. The cursor is *not* advanced
   * here — the poller is the canonical advance path. See class JSDoc.
   */
  private async handle_logs(logs: Logs, slot: number): Promise<void> {
    if (logs.err) return;
    if (!logs.logs || logs.logs.length === 0) return;

    const events = this.decoder.decode_logs(logs.logs);
    if (events.length === 0) return;

    this.health.mark_event();

    for (const ev of events) {
      try {
        await this.on_fill(ev, {
          signature: logs.signature,
          slot: BigInt(slot),
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

  /**
   * Schedules a single reconnect attempt. Coalesces — calling twice
   * before the timer fires is a no-op. Records `liveStreamDisconnectedAt`
   * before re-subscribing so the row reflects the gap.
   */
  private schedule_reconnect(): void {
    if (this.stopped || this.reconnect_handle) return;
    this.health.mark_live(false);
    this.reconnect_handle = setTimeout(() => {
      this.reconnect_handle = null;
      void this.cursor.mark_live_disconnected().catch(() => {});
      void this.subscribe();
    }, ENV.HEDGER_LIVE_LISTENER_RECONNECT_MS);
  }
}
