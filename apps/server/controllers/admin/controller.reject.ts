import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";
import { services } from "../../index";

const body_schema = z.object({
    reason: z.string().nullish(),
});

export default class RejectListingController {
    static async process(req: Request, res: Response) {
        const marketId = typeof req.params.marketId === "string" ? req.params.marketId : "";
        if (!marketId) {
            return ResponseWriter.invalid_data(res, "marketId required");
        }

        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid reject payload");
        }
        const reason = parsed.data.reason ?? null;

        try {
            const listing = await prisma.listing.findUnique({
                where: { marketId },
                include: { market: { include: { polymarket: true } } },
            });
            if (!listing) {
                return ResponseWriter.not_found(res, "listing not found");
            }
            // Allow rejecting a PENDING or APPROVED listing — rejecting an
            // approved one means we want to delist it.
            if (listing.status === ListingStatus.REJECTED) {
                return ResponseWriter.error(
                    res,
                    "LISTING_ALREADY_REJECTED",
                    "listing is already rejected",
                    undefined,
                    409,
                );
            }

            const wasApproved = listing.status === ListingStatus.APPROVED;

            const updated = await prisma.listing.update({
                where: { marketId },
                data: {
                    status: ListingStatus.REJECTED,
                    rejectedAt: new Date(),
                    rejectionReason: reason,
                },
            });

            // If we were tracking this market, unwind the mirror subscription,
            // book cache entry, and token index. Best-effort.
            if (wasApproved) {
                const poly = listing.market?.polymarket;
                if (poly) {
                    const token_ids = [poly.yesTokenId, poly.noTokenId];
                    try {
                        await services.mirror_control.unsubscribe(token_ids);
                        await services.book_cache.untrack(token_ids);
                        await services.token_index.remove(token_ids);
                    } catch (err) {
                        console.error("[admin/reject] mirror unwire failed", err);
                    }
                }
            }

            return ResponseWriter.success(res, updated, "Listing rejected");
        } catch (err) {
            console.error("[admin/reject]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
