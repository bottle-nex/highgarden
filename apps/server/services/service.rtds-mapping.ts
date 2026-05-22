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
