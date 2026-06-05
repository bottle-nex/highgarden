/**
 * Maps a fast-moving series's asset prefix (`btc` / `eth` / …) to the
 * Polymarket RTDS topic + filter symbol we should listen to for its
 * underlying-asset price. Single source of truth shared by the
 * recorder service and the round-anchor controller so a new asset is
 * added in exactly one place.
 *
 * Topic selection mirrors what Polymarket's own UI does:
 *   • Prefer `crypto_prices_chainlink` — that's the resolution source
 *     for these markets, so the anchor we capture matches the value
 *     the oracle compares the closing price against.
 *   • Fall back to `crypto_prices` (Binance) for assets Chainlink Data
 *     Streams doesn't publish (BNB at the time of writing).
 *
 * Coverage was verified by probing RTDS directly — every entry below
 * returned live ticks from the live server.
 */
export interface RtdsTarget {
    topic: "crypto_prices_chainlink" | "crypto_prices";
    symbol: string;
}

export const ASSET_RTDS_TARGETS: Record<string, RtdsTarget> = {
    btc: { topic: "crypto_prices_chainlink", symbol: "btc/usd" },
    eth: { topic: "crypto_prices_chainlink", symbol: "eth/usd" },
    sol: { topic: "crypto_prices_chainlink", symbol: "sol/usd" },
    xrp: { topic: "crypto_prices_chainlink", symbol: "xrp/usd" },
    doge: { topic: "crypto_prices_chainlink", symbol: "doge/usd" },
    hype: { topic: "crypto_prices_chainlink", symbol: "hype/usd" },
    bnb: { topic: "crypto_prices", symbol: "bnbusdt" },
};

/** Parses "btc-updown-5m" → "btc". Returns null when the series key
 *  doesn't match the Up/Down slug shape (defensive — derive_fast_series_key
 *  on the discovery side already enforces it). */
export function asset_prefix_for_series(series_key: string): string | null {
    const m = series_key.match(/^([a-z0-9]+)-updown-/i);
    return m ? m[1]!.toLowerCase() : null;
}

/** Resolves a series key to its RTDS subscription target. Returns null
 *  when the underlying asset isn't on either supported source. */
export function rtds_target_for_series(series_key: string): RtdsTarget | null {
    const prefix = asset_prefix_for_series(series_key);
    if (!prefix) return null;
    return ASSET_RTDS_TARGETS[prefix] ?? null;
}

/** Binance spot symbol for each tracked asset prefix. Used as the
 *  fallback price source when the round-anchor recorder hasn't yet
 *  captured a tick for a slot's start minute (very fresh recorder or
 *  a slot that started before this process came online). Binance's
 *  1-minute kline open is typically within ~$5 of the Chainlink
 *  BTC/USD price the oracle reads — close enough that the displayed
 *  "Price to Beat" reads correctly even when the live recorder
 *  doesn't have the row yet. */
export const ASSET_BINANCE_SYMBOL: Record<string, string> = {
    btc: "BTCUSDT",
    eth: "ETHUSDT",
    sol: "SOLUSDT",
    xrp: "XRPUSDT",
    doge: "DOGEUSDT",
    bnb: "BNBUSDT",
    // HYPE isn't on Binance spot — slots predating the recorder will
    // simply 404 for that series.
};

/** Fetches the open price of the 1-minute Binance kline that contains
 *  `timestamp_ms`. Server-side counterpart to the web's
 *  fetch_binance_kline_open_at. Returns null on network failure or when
 *  Binance doesn't have a kline for the requested minute (future
 *  timestamps, untracked symbols). */
export async function fetch_binance_kline_open_at(
    binance_symbol: string,
    timestamp_ms: number,
): Promise<number | null> {
    try {
        const start = Math.floor(timestamp_ms / 60_000) * 60_000;
        const url =
            "https://api.binance.com/api/v3/klines" +
            `?symbol=${encodeURIComponent(binance_symbol)}` +
            "&interval=1m" +
            `&startTime=${start}` +
            `&endTime=${start + 60_000}` +
            "&limit=1";
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data) || data.length === 0) return null;
        const row = data[0];
        if (!Array.isArray(row) || row.length < 2) return null;
        const open = Number(row[1]);
        return Number.isFinite(open) ? open : null;
    } catch {
        return null;
    }
}
