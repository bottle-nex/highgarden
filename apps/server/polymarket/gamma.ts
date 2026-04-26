export interface GammaToken {
    token_id: string;
    outcome: "Yes" | "No";
}

export interface GammaMarket {
    id: string;
    question: string;
    description: string;
    end_date_iso: string;
    volume_24hr: number;
    liquidity: number;
    minimum_tick_size: string;
    neg_risk: boolean;
    tokens: GammaToken[];
}

export interface FetchMarketsParams {
    limit?: number;
    order?: "volume_24hr" | "liquidity";
    ascending?: boolean;
}

export class GammaClient {
    private readonly baseUrl: string;

    constructor(baseUrl: string = process.env.POLYMARKET_API_BASE ?? "http://localhost:4000") {
        this.baseUrl = baseUrl;
    }

    async fetchMarkets(params: FetchMarketsParams = {}): Promise<GammaMarket[]> {
        const url = new URL("/gamma/markets", this.baseUrl);
        url.searchParams.set("limit", String(params.limit ?? 50));
        url.searchParams.set("order", params.order ?? "volume_24hr");
        url.searchParams.set("ascending", String(params.ascending ?? false));

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`gamma fetch failed: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        return data as GammaMarket[];
    }

    static pickYesNoTokenIds(market: GammaMarket): { yesTokenId: string; noTokenId: string } {
        const yes = market.tokens.find((t) => t.outcome === "Yes");
        const no = market.tokens.find((t) => t.outcome === "No");
        if (!yes || !no) {
            throw new Error(`market ${market.id} missing Yes/No tokens`);
        }
        return { yesTokenId: yes.token_id, noTokenId: no.token_id };
    }
}
