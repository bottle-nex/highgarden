import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

export default class ListPendingController {
    static async process(_req: Request, res: Response) {
        try {
            const pending = await prisma.listing.findMany({
                where: { status: ListingStatus.PENDING },
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
