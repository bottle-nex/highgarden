import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus, type MarketDTO, type MarketStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

export default class ListBookmarksController {
    static async process(req: Request, res: Response) {
        const user_id = req.user?.id;
        if (!user_id) {
            return ResponseWriter.not_authorized(res);
        }

        try {
            const bookmarks = await prisma.bookmark.findMany({
                where: { userId: user_id },
                orderBy: { createdAt: "desc" },
                include: {
                    market: {
                        include: {
                            polymarket: true,
                            listing: true,
                        },
                    },
                },
            });

            const markets: MarketDTO[] = [];
            for (const b of bookmarks) {
                const m = b.market;
                const p = m?.polymarket;
                const l = m?.listing;
                if (!m || !p) continue;
                // Only surface bookmarks pointing at markets that are still
                // approved — admins may have rejected a market after a user
                // bookmarked it, in which case we hide it from the list.
                if (!l || l.status !== ListingStatus.APPROVED) continue;
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
                    imageUrl: p.imageUrl,
                    eventId: p.eventId,
                    eventSlug: p.eventSlug,
                    tags: p.tags,
                });
            }

            return ResponseWriter.success(res, markets, "Bookmarks");
        } catch (err) {
            console.error("[bookmarks/list]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
