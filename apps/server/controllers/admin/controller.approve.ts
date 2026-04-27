import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";
import { services } from "../../index";

const body_schema = z.object({
    approvedBy: z.string().nullish(),
});

export default class ApproveListingController {
    static async process(req: Request, res: Response) {
        const marketId = typeof req.params.marketId === "string" ? req.params.marketId : "";
        if (!marketId) {
            return ResponseWriter.invalid_data(res, "marketId required");
        }

        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid approve payload");
        }
        const approvedBy = parsed.data.approvedBy ?? null;

        try {
            const listing = await prisma.listing.findUnique({
                where: { marketId },
                include: { market: { include: { polymarket: true } } },
            });
            if (!listing) {
                return ResponseWriter.not_found(res, "listing not found");
            }
            if (listing.status !== ListingStatus.PENDING) {
                return ResponseWriter.error(
                    res,
                    "LISTING_NOT_PENDING",
                    `listing is ${listing.status}`,
                    undefined,
                    409,
                );
            }

            const updated = await prisma.listing.update({
                where: { marketId },
                data: {
                    status: ListingStatus.APPROVED,
                    approvedAt: new Date(),
                    approvedBy,
                },
                include: { market: { include: { polymarket: true } } },
            });

            // Side effects: tell the mirror to start watching the YES/NO assets
            // and seed the in-memory book cache so the future /quote endpoint
            // has prices to serve.
            const poly = listing.market?.polymarket;
            if (poly) {
                const token_ids = [poly.yesTokenId, poly.noTokenId];
                try {
                    await services.book_cache.track(token_ids);
                    await services.mirror_control.subscribe(token_ids);
                } catch (err) {
                    console.error("[admin/approve] mirror wiring failed", err);
                    // Approval already persisted — don't roll back the DB write.
                    // Operator can re-approve or use a future "re-arm" endpoint.
                }
            } else {
                console.warn(
                    `[admin/approve] listing ${marketId} approved but has no polymarket linkage; mirror not notified`,
                );
            }

            return ResponseWriter.success(res, updated, "Listing approved");
        } catch (err) {
            console.error("[admin/approve]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
