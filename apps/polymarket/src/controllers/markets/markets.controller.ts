import type { Request, Response } from "express";
import { SEED_MARKETS, type SeedMarket } from "../../markets";
import type { BookSimulator } from "../../book";

interface GammaTokenDTO {
    token_id: string;
    outcome: "Yes" | "No";
}

interface GammaMarketDTO {
    id: string;
    question: string;
    description: string;
    end_date_iso: string;
    volume_24hr: number;
    liquidity: number;
    minimum_tick_size: string;
    neg_risk: boolean;
    tokens: GammaTokenDTO[];
}

export class MarketsController {
    constructor(private readonly simulator: BookSimulator) {}

    health = (_req: Request, res: Response): void => {
        res.json({ ok: true, markets: SEED_MARKETS.length });
    };

    listGammaMarkets = (req: Request, res: Response): void => {
        const limit = Number(req.query.limit ?? 100);
        const order = (req.query.order as string) ?? "volume_24hr";
        const ascending = req.query.ascending === "true";

        const payload = MarketsController.toGammaPayload(SEED_MARKETS);
        const sorted = [...payload].sort((a, b) => {
            const av = order === "liquidity" ? a.liquidity : a.volume_24hr;
            const bv = order === "liquidity" ? b.liquidity : b.volume_24hr;
            return ascending ? av - bv : bv - av;
        });
        res.json(sorted.slice(0, limit));
    };

    getClobBook = (req: Request, res: Response): void => {
        const tokenId = req.query.token_id as string | undefined;
        if (!tokenId) {
            res.status(400).json({ error: "missing token_id" });
            return;
        }
        const snap = this.simulator.getSnapshot(tokenId);
        if (!snap) {
            res.status(404).json({ error: "not found" });
            return;
        }
        res.json({
            market: tokenId,
            asks: snap.asks,
            bids: snap.bids,
            last_trade_price: snap.lastTradePriceCents / 100,
            timestamp: snap.updatedAt,
        });
    };

    private static toGammaPayload(markets: SeedMarket[]): GammaMarketDTO[] {
        return markets.map((m) => ({
            id: m.id,
            question: m.question,
            description: m.description,
            end_date_iso: m.endDate,
            volume_24hr: m.volume24hr,
            liquidity: m.liquidity,
            minimum_tick_size: m.minimumTickSize,
            neg_risk: m.negRisk,
            tokens: m.tokens.map((t) => ({ token_id: t.tokenId, outcome: t.outcome })),
        }));
    }
}
