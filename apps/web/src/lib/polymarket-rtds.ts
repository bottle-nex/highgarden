/**
 * Browser-side client for Polymarket's Real-Time Data Socket (RTDS) —
 * `wss://ws-live-data.polymarket.com`. Crypto price topics require no
 * auth, so we connect straight from the page. Same source Polymarket's
 * own UI reads, so the "Current Price" we display for a fast-moving
 * Up/Down market matches what they show.
 *
 * Two topics are wired here: `crypto_prices_chainlink` (the resolution
 * source — preferred) and `crypto_prices` (Binance — fallback for the
 * one asset Chainlink doesn't publish, BNB). The mapping lives in
 * `ASSET_RTDS_TARGETS` below and mirrors the backend's
 * `service.rtds-mapping.ts` exactly.
 */

export type RtdsTopic = 'crypto_prices_chainlink' | 'crypto_prices';

export interface RtdsTarget {
    topic: RtdsTopic;
    symbol: string;
}

const RTDS_URL = 'wss://ws-live-data.polymarket.com';

/** Single source of truth for asset → RTDS subscription. Mirrors the
 *  backend mapping; keep the two files in sync when adding an asset. */
const ASSET_RTDS_TARGETS: Record<string, RtdsTarget> = {
    btc: { topic: 'crypto_prices_chainlink', symbol: 'btc/usd' },
    eth: { topic: 'crypto_prices_chainlink', symbol: 'eth/usd' },
    sol: { topic: 'crypto_prices_chainlink', symbol: 'sol/usd' },
    xrp: { topic: 'crypto_prices_chainlink', symbol: 'xrp/usd' },
    doge: { topic: 'crypto_prices_chainlink', symbol: 'doge/usd' },
    hype: { topic: 'crypto_prices_chainlink', symbol: 'hype/usd' },
    bnb: { topic: 'crypto_prices', symbol: 'bnbusdt' },
};

/** Returns the RTDS subscription target for a fast-series key, or null
 *  when the underlying asset isn't on either supported source. Callers
 *  should hide the "Price To Beat" panel in that case. */
export function polymarket_rtds_target_for_series(
    series_key: string | null | undefined,
): RtdsTarget | null {
    if (!series_key) return null;
    const m = series_key.match(/^([a-z0-9]+)-updown-/i);
    if (!m) return null;
    const prefix = m[1]!.toLowerCase();
    return ASSET_RTDS_TARGETS[prefix] ?? null;
}

/** Subscribe to the live price ticker for a single RTDS target. Fires
 *  `on_tick` for every update (RTDS pushes multiple per second under
 *  active moves). Returns a teardown that closes the socket and stops
 *  reconnect attempts. */
export function subscribe_polymarket_rtds(
    target: RtdsTarget,

    on_tick: (price: number, timestamp_ms: number) => void,
): () => void {
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnect_timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = (): void => {
        if (closed) return;
        try {
            ws = new WebSocket(RTDS_URL);
        } catch {
            schedule_reconnect();
            return;
        }
        ws.onopen = () => {
            attempt = 0;
            // `filters` must be a JSON-stringified object — the bare
            // symbol form shown in Polymarket's docs is rejected by the
            // server with a regex validation error.
            ws?.send(
                JSON.stringify({
                    action: 'subscribe',
                    subscriptions: [
                        {
                            topic: target.topic,
                            type: 'update',
                            filters: JSON.stringify({ symbol: target.symbol }),
                        },
                    ],
                }),
            );
        };
        ws.onmessage = (ev: MessageEvent<string>) => {
            try {
                const msg = JSON.parse(ev.data) as {
                    topic?: string;
                    type?: string;
                    payload?: { symbol?: string; value?: number; timestamp?: number };
                };
                if (msg.topic !== target.topic || msg.type !== 'update') return;
                const p = msg.payload;
                if (!p || typeof p.value !== 'number' || p.symbol !== target.symbol) return;
                const ts = typeof p.timestamp === 'number' ? p.timestamp : Date.now();
                on_tick(p.value, ts);
            } catch {
                // ignore malformed frames
            }
        };
        ws.onclose = () => {
            if (!closed) schedule_reconnect();
        };
        ws.onerror = () => {
            // onclose fires next and triggers reconnect
        };
    };

    const schedule_reconnect = (): void => {
        if (closed) return;
        attempt += 1;
        const delay = Math.min(15_000, 500 * 2 ** Math.min(attempt - 1, 5));
        reconnect_timer = setTimeout(connect, delay);
    };

    connect();

    return () => {
        closed = true;
        if (reconnect_timer) {
            clearTimeout(reconnect_timer);
            reconnect_timer = null;
        }
        try {
            ws?.close(1000, 'unmount');
        } catch {
            // ignore
        }
        ws = null;
    };
}

/** Pretty asset label for the "BTC · LIVE" headline given an RTDS
 *  target — handles both the Chainlink `btc/usd` and Binance `btcusdt`
 *  symbol shapes. */
export function asset_label_for_rtds_target(target: RtdsTarget): string {
    if (target.topic === 'crypto_prices_chainlink') {
        const m = target.symbol.match(/^([a-z0-9]+)\//i);
        return m ? m[1]!.toUpperCase() : target.symbol.toUpperCase();
    }
    // Binance: strip the trailing "usdt" / "usd"
    return target.symbol.replace(/usdt?$/i, '').toUpperCase();
}

/** OHLC kline shape — kept identical to the one in binance-price.ts so
 *  the chart can consume either source without branching. */
export interface RtdsKline {
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
}

/** Bucket size in ms for each kline interval we support. Mirrors the
 *  set the chart's range selector exposes. */
const INTERVAL_MS: Record<string, number> = {
    '1m': 60_000,
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '1h': 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '1d': 24 * 60 * 60_000,
};

/** Aggregates RTDS ticks into rolling OHLC candles at the given
 *  interval, then emits the in-progress candle on every update so the
 *  chart's rightmost bar tracks live price moves.
 *
 *  Each tick updates the current bucket — `h` rises, `l` falls, `c`
 *  becomes the latest value. Crossing a bucket boundary opens a fresh
 *  candle with `o = h = l = c = value`. Callers should reset by
 *  unsubscribing + re-subscribing when the chart interval changes
 *  (the bucket cadence is baked into the closure). */
export function subscribe_polymarket_rtds_klines(
    target: RtdsTarget,
    interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',

    on_kline: (kline: RtdsKline) => void,
): () => void {
    const bucket_ms = INTERVAL_MS[interval];
    if (!bucket_ms) {
        // Defensive: unknown interval — no-op subscription.
        return () => {};
    }
    let current: RtdsKline | null = null;
    return subscribe_polymarket_rtds(target, (value, timestamp_ms) => {
        const bucket = Math.floor(timestamp_ms / bucket_ms) * bucket_ms;
        if (current === null || bucket !== current.t) {
            current = { t: bucket, o: value, h: value, l: value, c: value };
        } else {
            current = {
                t: current.t,
                o: current.o,
                h: Math.max(current.h, value),
                l: Math.min(current.l, value),
                c: value,
            };
        }
        on_kline(current);
    });
}
