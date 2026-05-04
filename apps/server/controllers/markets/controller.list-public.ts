import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus, type MarketDTO, type MarketStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

/**
 * Parse `?tag=Politics` or `?tag=Politics,Crypto` (also accepts repeated
 * `?tag=Politics&tag=Crypto`). Empty / non-string entries are dropped, and
 * the result is deduped case-insensitively. Returns `null` when no usable
 * tag was provided so we know to skip filtering entirely.
 */
function parse_tag_filter(raw: unknown): string[] | null {
    const collected: string[] = [];
    const push = (v: unknown) => {
        if (typeof v !== "string") return;
        for (const part of v.split(",")) {
            const trimmed = part.trim();
            if (trimmed.length > 0) collected.push(trimmed);
        }
    };
    if (Array.isArray(raw)) raw.forEach(push);
    else push(raw);

    if (collected.length === 0) return null;

    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of collected) {
        const k = v.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(v);
    }
    return out;
}

export default class ListPublicMarketsController {
    static async process(req: Request, res: Response) {
        const tag_filter = parse_tag_filter(req.query.tag);

        try {
            const listings = await prisma.listing.findMany({
                where: {
                    status: ListingStatus.APPROVED,
                    ...(tag_filter
                        ? {
                              market: {
                                  polymarket: { tags: { hasSome: tag_filter } },
                              },
                          }
                        : {}),
                },
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
                    imageUrl: p.imageUrl,
                    eventId: p.eventId,
                    eventSlug: p.eventSlug,
                    tags: p.tags,
                });
            }

            return ResponseWriter.success(res, markets, "Markets");
        } catch (err) {
            console.error("[markets/list-public]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
