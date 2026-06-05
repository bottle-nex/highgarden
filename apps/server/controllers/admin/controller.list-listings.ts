import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

type MarketKindFilter = "STANDARD" | "FAST_MOVING";

const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

function parseStatus(raw: string | undefined): ListingStatus | null {
    if (!raw) return null;
    if (raw in ListingStatus) return ListingStatus[raw as keyof typeof ListingStatus];
    return null;
}

function parseKind(raw: string | undefined): MarketKindFilter | null {
    if (!raw) return null;
    if (raw === "STANDARD" || raw === "FAST_MOVING") return raw;
    return null;
}

function parseLimit(raw: unknown): number {
    if (typeof raw !== "string") return DEFAULT_PAGE_SIZE;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
    return Math.min(n, MAX_PAGE_SIZE);
}

export default class ListListingsController {
    static async process(req: Request, res: Response) {
        const statusParam = req.query.status as string | undefined;
        const kindParam = req.query.kind as string | undefined;
        const status = parseStatus(statusParam);
        const kind = parseKind(kindParam);
        if (statusParam && !status) {
            return ResponseWriter.invalid_data(res, `invalid status: ${statusParam}`);
        }
        if (kindParam && !kind) {
            return ResponseWriter.invalid_data(res, `invalid kind: ${kindParam}`);
        }
        const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
        const limit = parseLimit(req.query.limit);
        try {
            const where: Record<string, unknown> = {};
            if (status) where.status = status;
            // PENDING listings whose market window has already closed are
            // useless — the admin can't approve them in time. Hide them so
            // the 5-min FAST_MOVING ladders stop drowning out the curated
            // markets. APPROVED / REJECTED rows are NOT filtered: ended
            // ones still need to be visible for audit and (for APPROVED)
            // for the resolver to eventually close them out.
            const market_filter: Record<string, unknown> = {};
            if (kind) market_filter.kind = kind;
            if (status === ListingStatus.PENDING) {
                market_filter.endAt = { gt: new Date() };
            }
            if (Object.keys(market_filter).length > 0) where.market = market_filter;
            // Cursor pagination: order by (discoveredAt DESC, marketId ASC)
            // so the sort is stable across ties and `cursor` references a
            // single row unambiguously. Fetch limit+1 to detect whether a
            // next page exists without an extra count query.
            const rows = await prisma.listing.findMany({
                where,
                orderBy: [{ discoveredAt: "desc" }, { marketId: "asc" }],
                cursor: cursor ? { marketId: cursor } : undefined,
                skip: cursor ? 1 : 0,
                take: limit + 1,
                include: { market: { include: { polymarket: true } } },
            });
            const has_more = rows.length > limit;
            const items = has_more ? rows.slice(0, limit) : rows;
            const next_cursor = has_more ? (items[items.length - 1]?.marketId ?? null) : null;
            return ResponseWriter.success(res, { items, nextCursor: next_cursor }, "Listings");
        } catch (err) {
            console.error("[admin/list-listings]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
