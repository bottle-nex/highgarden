import { prisma } from "@solmarket/database";
import { ASSET_RTDS_TARGETS, type RtdsTarget } from "./service.rtds-mapping";

/**
 * Records the underlying-asset price for every supported fast-moving
 * asset at each minute boundary, used to back the "Price To Beat"
 * display on event pages. Subscribes to Polymarket's Real-Time Data
 * Socket (RTDS) — Chainlink topic for BTC / ETH / SOL / XRP / DOGE /
 * HYPE (same source the oracle reads) and Binance topic for BNB (the
 * one asset Chainlink Data Streams doesn't publish).
 *
 * One WebSocket per (topic, symbol) target. RTDS rejects bundled
 * subscriptions on the same topic — sending six subscribes in one
 * message only honours the first — and a later subscribe message on
 * an existing connection replaces the previous filter rather than
 * adding to it. So we run one connection per asset, each managing its
 * own reconnect backoff. Total fan-out is tiny: seven idle WS handles
 * with ~1 incoming tick/sec each.
 *
 * One row per (symbol, minute boundary) — a 5-min slot ending at 22:25
 * UTC reads slotStart = 22:20, a 15-min slot ending at 22:30 reads
 * slotStart = 22:15. Every cadence we support aligns to a minute, so
 * one stream of per-minute snapshots covers them all.
 */
const RTDS_URL = "wss://ws-live-data.polymarket.com";

class RtdsConnection {
    private ws: WebSocket | null = null;
    private closed = false;
    private reconnect_timer: ReturnType<typeof setTimeout> | null = null;
    private attempt = 0;
    private last_minute = -1;

    // eslint-disable-next-line no-unused-vars
    constructor(private readonly target: RtdsTarget) {}

    public start(): void {
        this.connect();
    }

    public stop(): void {
        this.closed = true;
        if (this.reconnect_timer) {
            clearTimeout(this.reconnect_timer);
            this.reconnect_timer = null;
        }
        try {
            this.ws?.close(1000, "stop");
        } catch {
            // ignore — process is shutting down
        }
        this.ws = null;
    }

    private connect(): void {
        if (this.closed) return;
        try {
            this.ws = new WebSocket(RTDS_URL);
        } catch (err) {
            console.warn(`[round-anchor] ws ctor failed (${this.label()})`, err);
            this.schedule_reconnect();
            return;
        }
        this.ws.onopen = () => {
            this.attempt = 0;
            // RTDS requires `filters` to be a JSON-stringified object.
            // Bare-symbol form rejected with a regex validation error.
            const msg = {
                action: "subscribe",
                subscriptions: [
                    {
                        topic: this.target.topic,
                        type: "update",
                        filters: JSON.stringify({ symbol: this.target.symbol }),
                    },
                ],
            };
            this.ws?.send(JSON.stringify(msg));
        };
        this.ws.onmessage = (ev: MessageEvent) => {
            try {
                const data = JSON.parse(String(ev.data)) as unknown;
                this.handle_message(data);
            } catch {
                // ignore malformed frames
            }
        };
        this.ws.onclose = () => {
            if (!this.closed) {
                console.warn(`[round-anchor] ws closed (${this.label()}), reconnecting`);
                this.schedule_reconnect();
            }
        };
        this.ws.onerror = () => {
            // onclose fires next and triggers reconnect
        };
    }

    private schedule_reconnect(): void {
        if (this.closed) return;
        this.attempt += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.attempt - 1, 5));
        this.reconnect_timer = setTimeout(() => this.connect(), delay);
    }

    private handle_message(data: unknown): void {
        if (!data || typeof data !== "object") return;
        const obj = data as {
            topic?: string;
            type?: string;
            payload?: { symbol?: string; value?: number; timestamp?: number };
        };
        if (obj.type !== "update" || obj.topic !== this.target.topic) return;
        const p = obj.payload;
        if (!p || typeof p.value !== "number" || p.symbol !== this.target.symbol) return;
        const ts = typeof p.timestamp === "number" ? p.timestamp : Date.now();
        void this.persist_tick(p.value, ts);
    }

    private async persist_tick(value: number, timestamp_ms: number): Promise<void> {
        const minute = Math.floor(timestamp_ms / 60_000) * 60_000;
        // In-memory dedup keeps the DB free of duplicate-minute upserts —
        // we'd otherwise hammer Postgres with one query per tick (≥1/sec
        // from Chainlink). Only the first tick of each minute reaches
        // the upsert below.
        if (this.last_minute === minute) return;
        this.last_minute = minute;
        try {
            await prisma.roundAnchorPrice.upsert({
                where: {
                    symbol_slotStart: {
                        symbol: this.target.symbol,
                        slotStart: new Date(minute),
                    },
                },
                create: {
                    symbol: this.target.symbol,
                    slotStart: new Date(minute),
                    price: value.toString(),
                },
                update: {}, // first writer wins — never overwrite the original tick
            });
        } catch (err) {
            // Reset the dedup so the next tick in this minute can retry.
            this.last_minute = -1;
            console.warn(
                "[round-anchor] persist failed",
                this.target.symbol,
                new Date(minute).toISOString(),
                err,
            );
        }
    }

    private label(): string {
        return `${this.target.topic}:${this.target.symbol}`;
    }
}

export default class RoundAnchorRecorder {
    private connections: RtdsConnection[] = [];

    public async start(): Promise<void> {
        const targets = Object.values(ASSET_RTDS_TARGETS);
        if (targets.length === 0) {
            console.warn("[round-anchor] no RTDS targets configured — skipping start");
            return;
        }
        for (const target of targets) {
            const conn = new RtdsConnection(target);
            conn.start();
            this.connections.push(conn);
        }
        console.log(
            `[round-anchor] started — ${targets.length} connections (${targets
                .map((t) => t.symbol)
                .join(",")})`,
        );
    }

    public stop(): void {
        for (const conn of this.connections) conn.stop();
        this.connections = [];
    }
}
