import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

type MarketKindFilter = "STANDARD" | "FAST_MOVING";

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
            const listings = await prisma.listing.findMany({
                where,
                orderBy: { discoveredAt: "desc" },
                include: { market: { include: { polymarket: true } } },
            });
            return ResponseWriter.success(res, listings, "Listings");
        } catch (err) {
            console.error("[admin/list-listings]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
