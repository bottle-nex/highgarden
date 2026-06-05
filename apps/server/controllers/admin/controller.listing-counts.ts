import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

interface CountsResult {
    PENDING: number;
    APPROVED: number;
    REJECTED: number;
    FAST_MOVING: number;
}

// Counts used by the admin Curator tabs. Mirrors the filter logic in
// list-listings: PENDING tab hides ended markets, FAST_MOVING tab is the
// PENDING+FAST_MOVING subset. Cached briefly to absorb the burst when the
// admin opens the page and 4 tabs all want their badge populated.
const CACHE_TTL_MS = 5_000;
let cache: { expires_at: number; payload: CountsResult } | null = null;

export default class ListingCountsController {
    static async process(_req: Request, res: Response) {
        const now_ms = Date.now();
        if (cache && cache.expires_at > now_ms) {
            return ResponseWriter.success(res, cache.payload, "Listing counts");
        }

        try {
            const now = new Date();
            const [pending, approved, rejected, fast_pending] = await Promise.all([
                prisma.listing.count({
                    where: {
                        status: ListingStatus.PENDING,
                        market: { kind: "STANDARD", endAt: { gt: now } },
                    },
                }),
                prisma.listing.count({
                    where: {
                        status: ListingStatus.APPROVED,
                        market: { kind: "STANDARD" },
                    },
                }),
                prisma.listing.count({
                    where: {
                        status: ListingStatus.REJECTED,
                        market: { kind: "STANDARD" },
                    },
                }),
                prisma.listing.count({
                    where: {
                        status: ListingStatus.PENDING,
                        market: { kind: "FAST_MOVING", endAt: { gt: now } },
                    },
                }),
            ]);

            const payload: CountsResult = {
                PENDING: pending,
                APPROVED: approved,
                REJECTED: rejected,
                FAST_MOVING: fast_pending,
            };
            cache = { expires_at: now_ms + CACHE_TTL_MS, payload };
            return ResponseWriter.success(res, payload, "Listing counts");
        } catch (err) {
            console.error("[admin/listing-counts]", err);
            return ResponseWriter.system_error(res);
        }
    }

    static invalidate(): void {
        cache = null;
    }
}
