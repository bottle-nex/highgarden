import type { PriceHistoryPoint, PriceHistoryRange } from "@solmarket/types";

const DEFAULT_CLOB_URL = "https://clob.polymarket.com";

interface RangeMap {
    interval: string;
    fidelity: number;
}

const RANGE_TO_CLOB: Record<PriceHistoryRange, RangeMap> = {
    "1h": { interval: "1h", fidelity: 1 },
    "6h": { interval: "6h", fidelity: 5 },
    "1d": { interval: "1d", fidelity: 5 },
    "1w": { interval: "1w", fidelity: 60 },
    "1m": { interval: "1m", fidelity: 60 },
    all: { interval: "max", fidelity: 1440 },
};

interface RawHistoryResponse {
    history?: Array<{ t?: number; p?: number }>;
}

export class ClobClient {
    private readonly base_url: string;

    constructor(base_url: string = process.env.SERVER_POLYMARKET_CLOB_URL ?? DEFAULT_CLOB_URL) {
        this.base_url = base_url;
    }

    async fetch_price_history(
        token_id: string,
        range: PriceHistoryRange,
    ): Promise<PriceHistoryPoint[]> {
        const map = RANGE_TO_CLOB[range];
        const url = new URL("/prices-history", this.base_url);
        url.searchParams.set("market", token_id);
        url.searchParams.set("interval", map.interval);
        url.searchParams.set("fidelity", String(map.fidelity));

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`clob price-history failed: ${res.status} ${res.statusText}`);
        }
        const raw = (await res.json()) as RawHistoryResponse;
        const points: PriceHistoryPoint[] = [];
        for (const row of raw.history ?? []) {
            if (typeof row.t !== "number" || typeof row.p !== "number") continue;
            if (!Number.isFinite(row.t) || !Number.isFinite(row.p)) continue;
            points.push({ t: row.t, p: row.p });
        }
        return points;
    }
}
