import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus, type MarketDTO, type MarketStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

export default class ListPublicMarketsController {
    static async process(_req: Request, res: Response) {
        try {
            const listings = await prisma.listing.findMany({
                where: { status: ListingStatus.APPROVED },
                orderBy: { approvedAt: "desc" },
                include: { market: { include: { polymarket: true } } },
            });

            const markets: MarketDTO[] = [];
            for (const l of listings) {
                const m = l.market;
                const p = m?.polymarket;
                if (!m || !p) continue;
                markets.push({
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    endAt: m.endAt.toISOString(),
                    status: m.status as MarketStatus,
                    polyMarketId: m.polyMarketId,
                    yesTokenId: p.yesTokenId,
                    noTokenId: p.noTokenId,
                    tickSize: p.tickSize,
                    negRisk: p.negRisk,
                    solanaMarketPda: m.solanaMarketPda,
                    volume24hUsd: l.volume24hUsd,
                    liquidityUsd: l.liquidityUsd,
                });
            }

            return ResponseWriter.success(res, markets, "Markets");
        } catch (err) {
            console.error("[markets/list-public]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
