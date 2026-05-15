import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

export default class ListPendingController {
    static async process(_req: Request, res: Response) {
        try {
            // Already-ended markets clog the pending list — especially the
            // 5-min FAST_MOVING slots that pile up in minutes. The admin
            // can't usefully approve a market whose window has closed, so
            // we drop them here rather than asking the UI to filter.
            const now = new Date();
            const pending = await prisma.listing.findMany({
                where: {
                    status: ListingStatus.PENDING,
                    market: { endAt: { gt: now } },
                },
                orderBy: { volume24hUsd: "desc" },
                include: { market: { include: { polymarket: true } } },
            });
            return ResponseWriter.success(res, pending, "Pending listings");
        } catch (err) {
            console.error("[admin/list-pending]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
