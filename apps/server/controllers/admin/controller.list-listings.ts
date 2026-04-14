import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

function parseStatus(raw: string | undefined): ListingStatus | null {
    if (!raw) return null;
    if (raw in ListingStatus) return ListingStatus[raw as keyof typeof ListingStatus];
    return null;
}

export default class ListListingsController {
    static async process(req: Request, res: Response) {
        const statusParam = req.query.status as string | undefined;
        const status = parseStatus(statusParam);
        if (statusParam && !status) {
            return ResponseWriter.invalid_data(res, `invalid status: ${statusParam}`);
        }
        try {
            const listings = await prisma.listing.findMany({
                where: status ? { status } : undefined,
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
