import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus, type MarketDTO, type MarketStatus, type Outcome } from "@solmarket/types";
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

            // Same claimable derivation as the public list — single batched
            // ResolverState fetch keyed by marketId, then a per-row map
            // lookup below.
            const market_ids = bookmarks
                .map((b) => b.market?.id)
                .filter((id): id is string => !!id);
            const resolver_rows =
                market_ids.length > 0
                    ? await prisma.resolverState.findMany({
                          where: { marketId: { in: market_ids } },
                          select: { marketId: true, stage: true },
                      })
                    : [];
            const stage_by_market = new Map(
                resolver_rows.map((r) => [r.marketId, r.stage] as const),
            );

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
                    kind: m.kind,
                    fastSeriesKey: m.fastSeriesKey,
                    winningOutcome: m.winningOutcome as Outcome | null,
                    resolvedAt: m.resolvedAt?.toISOString() ?? null,
                    claimable:
                        stage_by_market.get(m.id) === "SOLANA_RESOLVED"
                        || stage_by_market.get(m.id) === "REDEEMED",
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
