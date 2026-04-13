import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

const body_schema = z.object({
    reason: z.string().nullish(),
});

export default class RejectListingController {
    static async process(req: Request, res: Response) {
        const { marketId } = req.params;
        if (!marketId) {
            return ResponseWriter.invalid_data(res, "marketId required");
        }

        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid reject payload");
        }
        const reason = parsed.data.reason ?? null;

        try {
            const listing = await prisma.listing.findUnique({ where: { marketId } });
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
                    status: ListingStatus.REJECTED,
                    rejectedAt: new Date(),
                    rejectionReason: reason,
                },
            });
            return ResponseWriter.success(res, updated, "Listing rejected");
        } catch (err) {
            console.error("[admin/reject]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
