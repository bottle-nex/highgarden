/**
 * SOL/USD price feed. Sources from CoinGecko's free public endpoint and
 * caches in-process for 60s — CoinGecko's free tier has a strict rate
 * limit (~10–50 req/min) so we never want to hit it on the hot path.
 *
 * The SolDepositPoller calls `get_sol_usd_rate_cents()` once per detected
 * deposit. With dozens of users this still stays well under the limit
 * because of the cache; a single fetch covers the whole tick.
 */

const COINGECKO_URL =
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

/** How long a fetched rate stays valid in-memory. 60s = ~2× the poller
 *  tick interval, so we usually serve cached values inside a single tick. */
const TTL_MS = 60_000;

interface Cached {
    rate_cents: number;
    expires_at: number;
}

interface CoinGeckoResponse {
    solana?: { usd?: number };
}

export default class CoinGeckoPriceFeed {
    private cached: Cached | null = null;

    /**
     * Returns the SOL/USD rate in integer cents (e.g. `14250` for $142.50).
     * Throws if CoinGecko is unreachable or returns a non-positive price
     * — the caller decides whether to surface a 503 or skip the deposit
     * for this tick.
     */
    public async get_sol_usd_rate_cents(): Promise<number> {
        if (this.cached && this.cached.expires_at > Date.now()) {
            return this.cached.rate_cents;
        }
        const fresh = await this.fetch_fresh();
        this.cached = { rate_cents: fresh, expires_at: Date.now() + TTL_MS };
        return fresh;
    }

    private async fetch_fresh(): Promise<number> {
        const res = await fetch(COINGECKO_URL);
        if (!res.ok) {
            throw new Error(`coingecko returned ${res.status}`);
        }
        const body = (await res.json()) as CoinGeckoResponse;
        const usd = body?.solana?.usd;
        if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
            throw new Error(`coingecko returned invalid SOL price: ${JSON.stringify(body)}`);
        }
        return Math.round(usd * 100);
    }
}
