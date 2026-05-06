import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";

export interface GammaResolution {
    closed: boolean;
    archived: boolean;
    /** 0 = YES, 1 = NO. null when not yet resolved. */
    winningOutcomeIndex: 0 | 1 | null;
    /** Best-effort timestamp of resolution if Gamma exposes one. */
    resolvedAt: Date | null;
    /** Raw "Yes"/"No" labels from outcomes (for sanity check). */
    outcomes: string[];
    /** Final prices array as strings, e.g. ["1","0"]. Empty when not resolved. */
    outcomePrices: string[];
    /** CTF condition ID (bytes32 hex). Required for redeemPositions. */
    conditionId: string | null;
    /** True for Polymarket NegRisk multi-outcome markets — redemption uses a different contract. */
    negRisk: boolean;
}

interface RawGammaMarket {
    id?: string | number;
    closed?: boolean;
    archived?: boolean;
    active?: boolean;
    outcomes?: string;
    outcomePrices?: string;
    endDate?: string;
    umaEndDate?: string;
    resolvedBy?: string | null;
    conditionId?: string | null;
    negRisk?: boolean;
}

export default class HedgerGammaClient {
    private readonly base_url: string;
    private readonly log = LoggerFactory.for_category("gamma");

    constructor() {
        this.base_url = ENV.HEDGER_POLYMARKET_GAMMA_URL;
    }

    public async fetch_resolution(polymarket_market_id: string): Promise<GammaResolution | null> {
        const raw = await this.fetch_raw_market(polymarket_market_id);
        if (!raw) return null;
        return this.shape_resolution(raw);
    }

    private async fetch_raw_market(market_id: string): Promise<RawGammaMarket | null> {
        const url = new URL("/markets", this.base_url);
        url.searchParams.set("id", market_id);
        url.searchParams.set("limit", "1");

        const res = await fetch(url);
        if (!res.ok) {
            this.log.warn(
                { marketId: market_id, status: res.status },
                "gamma fetch returned non-ok",
            );
            return null;
        }
        const body = (await res.json()) as RawGammaMarket[] | RawGammaMarket | null;
        if (!body) return null;
        if (Array.isArray(body)) return body[0] ?? null;
        return body;
    }

    private shape_resolution(raw: RawGammaMarket): GammaResolution {
        const outcomes = parse_string_array(raw.outcomes);
        const outcome_prices = parse_string_array(raw.outcomePrices);
        return {
            closed: !!raw.closed,
            archived: !!raw.archived,
            winningOutcomeIndex: this.derive_winner(outcome_prices, !!raw.closed),
            resolvedAt: this.derive_resolved_at(raw),
            outcomes,
            outcomePrices: outcome_prices,
            conditionId: raw.conditionId ?? null,
            negRisk: !!raw.negRisk,
        };
    }

    private derive_winner(prices: string[], closed: boolean): 0 | 1 | null {
        if (!closed) return null;
        if (prices.length < 2) return null;
        const yes = parse_price(prices[0]);
        const no = parse_price(prices[1]);
        if (yes === null || no === null) return null;
        if (yes >= 0.999 && no <= 0.001) return 0;
        if (no >= 0.999 && yes <= 0.001) return 1;
        return null;
    }

    private derive_resolved_at(raw: RawGammaMarket): Date | null {
        if (!raw.closed) return null;
        const candidate = raw.umaEndDate ?? raw.endDate;
        if (!candidate) return null;
        const d = new Date(candidate);
        return Number.isFinite(d.getTime()) ? d : null;
    }
}

function parse_string_array(input: string | undefined | null): string[] {
    if (!input) return [];
    try {
        const parsed = JSON.parse(input);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((v) => String(v));
    } catch {
        return [];
    }
}

function parse_price(input: string | undefined): number | null {
    if (input === undefined) return null;
    const n = Number(input);
    return Number.isFinite(n) ? n : null;
}
