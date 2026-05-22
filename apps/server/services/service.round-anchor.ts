import { prisma } from "@solmarket/database";
import { ASSET_RTDS_TARGETS } from "./service.rtds-mapping";

/**
 * Records the underlying-asset price for every fast-moving series we
 * follow at each minute boundary, used to back the "Price To Beat"
 * display on event pages. Subscribes to Polymarket's Real-Time Data
 * Socket (RTDS) on `crypto_prices_chainlink` for assets carried on
 * Chainlink Data Streams (BTC/ETH/SOL/XRP/DOGE/HYPE) and falls back
 * to the Binance topic `crypto_prices` for assets Chainlink doesn't
 * publish (BNB) — same fallback Polymarket's own UI uses, so the
 * anchor we surface matches their displayed value.
 *
 * One row per (symbol, minute boundary) — a 5-min slot ending at 22:25
 * UTC reads slotStart = 22:20, a 15-min slot ending at 22:30 reads
 * slotStart = 22:15. Every cadence we support aligns to a minute, so
 * one stream of per-minute snapshots covers them all.
 */
const RTDS_URL = "wss://ws-live-data.polymarket.com";

export default class RoundAnchorRecorder {
    private ws: WebSocket | null = null;
    private closed = false;
    private reconnect_timer: ReturnType<typeof setTimeout> | null = null;
    private attempt = 0;
    /** Symbols we recognize. Subscribing is unconditional (every supported
     *  asset, every boot) so manually-approved markets for non-subscribed
     *  series still get a Price-to-Beat — recorder traffic is one row per
     *  minute per symbol, negligible at this scale. */
    private targets: ReadonlyArray<{ topic: string; symbol: string }> =
        Object.values(ASSET_RTDS_TARGETS);
    /** Minute boundary (UTC epoch ms) most recently persisted for each
     *  symbol. RTDS pushes multiple ticks per second; we only need one
     *  row per minute, so we dedupe in memory before hitting the DB. */
    private last_minute_per_symbol = new Map<string, number>();

    public async start(): Promise<void> {
        if (this.targets.length === 0) {
            console.warn("[round-anchor] no RTDS targets configured — skipping start");
            return;
        }
        this.connect();
        console.log(
            `[round-anchor] started — targets=${this.targets
                .map((t) => `${t.topic}:${t.symbol}`)
                .join(",")}`,
        );
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
            console.warn("[round-anchor] ws ctor failed", err);
            this.schedule_reconnect();
            return;
        }
        this.ws.onopen = () => {
            this.attempt = 0;
            this.send_subscriptions();
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
            if (!this.closed) this.schedule_reconnect();
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

    private send_subscriptions(): void {
        if (this.targets.length === 0) return;
        // RTDS expects `filters` to be a JSON-encoded object string —
        // `{"symbol":"btc/usd"}` — not the bare symbol. The published
        // docs example (`"filters": "btcusdt"`) is wrong; the server
        // rejects with a regex validation error if you pass a raw
        // string.
        const msg = {
            action: "subscribe",
            subscriptions: this.targets.map(({ topic, symbol }) => ({
                topic,
                type: "update",
                filters: JSON.stringify({ symbol }),
            })),
        };
        this.ws?.send(JSON.stringify(msg));
    }

    private handle_message(data: unknown): void {
        if (!data || typeof data !== "object") return;
        const obj = data as {
            topic?: string;
            type?: string;
            payload?: { symbol?: string; value?: number; timestamp?: number };
        };
        if (obj.type !== "update") return;
        if (
            obj.topic !== "crypto_prices_chainlink"
            && obj.topic !== "crypto_prices"
        ) {
            return;
        }
        const p = obj.payload;
        if (!p || typeof p.symbol !== "string" || typeof p.value !== "number") return;
        // Only persist symbols we explicitly subscribed to — the server
        // shouldn't push anything else, but be defensive against future
        // protocol changes that might broaden the topic.
        const known = this.targets.some(
            (t) => t.topic === obj.topic && t.symbol === p.symbol,
        );
        if (!known) return;
        void this.persist_tick(p.symbol, p.value, p.timestamp);
    }

    private async persist_tick(
        symbol: string,
        value: number,
        timestamp_ms: number | undefined,
    ): Promise<void> {
        const ts = typeof timestamp_ms === "number" ? timestamp_ms : Date.now();
        const minute = Math.floor(ts / 60_000) * 60_000;
        // In-memory dedup keeps the DB free of duplicate-minute upserts —
        // we'd otherwise hammer Postgres with one query per tick (≥1/sec
        // from Chainlink). Only the first tick of each minute reaches
        // the upsert below.
        if (this.last_minute_per_symbol.get(symbol) === minute) return;
        this.last_minute_per_symbol.set(symbol, minute);
        try {
            await prisma.roundAnchorPrice.upsert({
                where: { symbol_slotStart: { symbol, slotStart: new Date(minute) } },
                create: { symbol, slotStart: new Date(minute), price: value.toString() },
                update: {}, // first writer wins — never overwrite the original tick
            });
        } catch (err) {
            // Reset the dedup so the next tick in this minute can retry.
            this.last_minute_per_symbol.delete(symbol);
            console.warn(
                "[round-anchor] persist failed",
                symbol,
                new Date(minute).toISOString(),
                err,
            );
        }
    }

}
