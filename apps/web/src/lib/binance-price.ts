/**
 * Live spot-price feed from Binance for the underlying asset of a
 * FAST_MOVING series. Binance's public WSS pushes per-trade ticks for
 * BTCUSDT / ETHUSDT / etc. with no auth and CORS enabled, so we can hit
 * it straight from the browser. Used by the event page to render the
 * current "BTC = $81,643.50" headline next to the YES/NO probability
 * chart — without it, you can't tell which way the underlying is moving
 * during a 5-min Up/Down round.
 */

/** Map our `fastSeriesKey` asset prefix to Binance's symbol convention.
 *  Polymarket uses short prefixes (`btc`, `eth`, `sol`, `bnb`, `xrp`,
 *  `doge`, `hype`), Binance uses the upper-cased ticker. `Hyperliquid`
 *  isn't on Binance spot — caller should hide the price headline in
 *  that case. */
const SERIES_PREFIX_TO_BINANCE: Record<string, string> = {
    btc: 'BTCUSDT',
    eth: 'ETHUSDT',
    sol: 'SOLUSDT',
    bnb: 'BNBUSDT',
    xrp: 'XRPUSDT',
    doge: 'DOGEUSDT',
};

export function binance_symbol_for_series(series_key: string | null | undefined): string | null {
    if (!series_key) return null;
    const m = series_key.match(/^([a-z0-9]+)-updown-/i);
    if (!m) return null;
    const prefix = m[1]!.toLowerCase();
    return SERIES_PREFIX_TO_BINANCE[prefix] ?? null;
}

/** Pretty asset name for the headline ("BTC" not "BTCUSDT"). */
export function asset_label_for_symbol(symbol: string): string {
    if (symbol.endsWith('USDT')) return symbol.slice(0, -4);
    if (symbol.endsWith('USD')) return symbol.slice(0, -3);
    return symbol;
}

/** Initial price snapshot via Binance REST. Used while the WSS is
 *  connecting so the headline doesn't sit on "—" for the first second. */
export async function fetch_binance_price(symbol: string): Promise<number | null> {
    try {
        const res = await fetch(
            `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
        );
        if (!res.ok) return null;
        const data = (await res.json()) as { price?: string };
        const p = Number(data.price);
        return Number.isFinite(p) ? p : null;
    } catch {
        return null;
    }
}

/** OHLC candle, the shape both price-line and candlestick chart modes
 *  consume on the event page. `t` is the candle's open-time epoch ms,
 *  matching `recharts`'s expected x-domain when `scale="time"`. */
export interface Kline {
    t: number;
    o: number;
    h: number;
    l: number;
    c: number;
}

/** Binance interval label that the kline endpoints accept. Subset of
 *  the full Binance set — only the cadences the chart's range selector
 *  exposes. */
export type BinanceKlineInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

/** REST snapshot of recent candles. Used to seed both the line and
 *  candlestick chart modes before the WSS stream takes over. */
export async function fetch_binance_klines(
    symbol: string,
    interval: BinanceKlineInterval,
    limit: number,
): Promise<Kline[]> {
    try {
        const url =
            `https://api.binance.com/api/v3/klines` +
            `?symbol=${encodeURIComponent(symbol)}` +
            `&interval=${interval}` +
            `&limit=${Math.min(1000, Math.max(1, limit))}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data)) return [];
        const out: Kline[] = [];
        for (const row of data) {
            if (!Array.isArray(row) || row.length < 5) continue;
            const t = Number(row[0]);
            const o = Number(row[1]);
            const h = Number(row[2]);
            const l = Number(row[3]);
            const c = Number(row[4]);
            if ([t, o, h, l, c].every((v) => Number.isFinite(v))) {
                out.push({ t, o, h, l, c });
            }
        }
        return out;
    } catch {
        return [];
    }
}

/** Subscribe to Binance's per-interval kline stream. The same kline is
 *  pushed repeatedly as the current candle ticks; when the candle closes
 *  Binance emits a final frame and starts a new one. Caller's `on_kline`
 *  is invoked for every update (closed and in-progress) so the chart
 *  reflects the live candle in real time. */
export function subscribe_binance_klines(
    symbol: string,
    interval: BinanceKlineInterval,
     
    on_kline: (kline: Kline) => void,
): () => void {
    const stream = `${symbol.toLowerCase()}@kline_${interval}`;
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnect_timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = (): void => {
        if (closed) return;
        try {
            ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
        } catch {
            schedule_reconnect();
            return;
        }
        ws.onopen = () => {
            attempt = 0;
        };
        ws.onmessage = (ev: MessageEvent<string>) => {
            try {
                const msg = JSON.parse(ev.data) as {
                    k?: { t?: number; o?: string; h?: string; l?: string; c?: string };
                };
                const k = msg.k;
                if (!k) return;
                const t = Number(k.t);
                const o = Number(k.o);
                const h = Number(k.h);
                const l = Number(k.l);
                const c = Number(k.c);
                if ([t, o, h, l, c].every((v) => Number.isFinite(v))) {
                    on_kline({ t, o, h, l, c });
                }
            } catch {
                // ignore malformed frames
            }
        };
        ws.onclose = () => {
            if (!closed) schedule_reconnect();
        };
        ws.onerror = () => {
            // close handler will fire next.
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

/** Subscribe to Binance's per-trade stream for a symbol. Invokes `on_tick`
 *  on every trade message with the latest price. Returns a teardown that
 *  closes the socket and stops reconnect attempts. Auto-reconnects with
 *  a short backoff if the connection drops mid-session — Binance closes
 *  idle sockets after 24h and may evict during traffic spikes. */
export function subscribe_binance_trades(
    symbol: string,
     
    on_tick: (price: number) => void,
): () => void {
    const stream = symbol.toLowerCase();
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnect_timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = (): void => {
        if (closed) return;
        try {
            ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}@trade`);
        } catch {
            schedule_reconnect();
            return;
        }
        ws.onopen = () => {
            attempt = 0;
        };
        ws.onmessage = (ev: MessageEvent<string>) => {
            try {
                const data = JSON.parse(ev.data) as { p?: string };
                const price = Number(data.p);
                if (Number.isFinite(price)) on_tick(price);
            } catch {
                // ignore parse errors — Binance occasionally pushes
                // non-trade frames on the combined stream which we don't
                // subscribe to here, but be defensive.
            }
        };
        ws.onclose = () => {
            if (!closed) schedule_reconnect();
        };
        ws.onerror = () => {
            // close handler will fire next and trigger reconnect.
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
