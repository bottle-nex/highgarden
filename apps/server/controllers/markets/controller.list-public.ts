import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus, type MarketDTO, type MarketStatus, type Outcome } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";
import MarketSettlementService from "../../services/service.market-settlement";

// Snapshot cache for the public-list endpoint. Every connected dashboard
// tab polls this every 8s and several components inside one tab fan out
// to the same call on mount — without a cache, each request hits Postgres
// independently and the result set (every approved future market plus
// resolver-stage lookups) is identical for everyone for the next few
// seconds. A 3-second TTL keeps the dashboard close to real-time while
// collapsing N concurrent callers onto one DB hit per tag-filter.
const CACHE_TTL_MS = 3_000;
const snapshot_cache = new Map<string, { expires_at: number; payload: MarketDTO[] }>();

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
        const cache_key = tag_filter
            ? tag_filter
                  .map((t) => t.toLowerCase())
                  .sort()
                  .join(",")
            : "";
        const now_ms = Date.now();
        const cached = snapshot_cache.get(cache_key);
        if (cached && cached.expires_at > now_ms) {
            return ResponseWriter.success(res, cached.payload, "Markets");
        }

        try {
            // Hide markets whose Polymarket window has already closed. The
            // dashboard shouldn't surface tiles users can't actually trade
            // on, and FAST_MOVING 5-min ladders pile up ended slots within
            // minutes — so the filter is much more important for them than
            // for STANDARD long-form markets.
            const now = new Date();
            const listings = await prisma.listing.findMany({
                where: {
                    status: ListingStatus.APPROVED,
                    market: {
                        endAt: { gt: now },
                        ...(tag_filter ? { polymarket: { tags: { hasSome: tag_filter } } } : {}),
                    },
                },
                orderBy: { approvedAt: "desc" },
                include: { market: { include: { polymarket: true } } },
            });

            const market_ids = listings.map((l) => l.market?.id).filter((id): id is string => !!id);
            const settlements = await MarketSettlementService.find_many(market_ids);

            const markets: MarketDTO[] = [];
            for (const l of listings) {
                const m = l.market;
                const p = m?.polymarket;
                if (!m || !p) continue;
                const resolution = MarketSettlementService.project(m, settlements.get(m.id));
                markets.push({
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    endAt: m.endAt.toISOString(),
                    status: resolution.status as MarketStatus,
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
                    winningOutcome: resolution.winningOutcome as Outcome | null,
                    resolvedAt: resolution.resolvedAt?.toISOString() ?? null,
                    claimable: resolution.claimable,
                    tags: p.tags,
                });
            }

            snapshot_cache.set(cache_key, {
                expires_at: now_ms + CACHE_TTL_MS,
                payload: markets,
            });
            return ResponseWriter.success(res, markets, "Markets");
        } catch (err) {
            console.error("[markets/list-public]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
