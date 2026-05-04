import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import type { BookmarkStatusDTO } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

export default class AddBookmarkController {
    static async process(req: Request, res: Response) {
        const user_id = req.user?.id;
        if (!user_id) {
            return ResponseWriter.not_authorized(res);
        }

        const market_id = typeof req.params.id === "string" ? req.params.id : "";
        if (!market_id) {
            return ResponseWriter.invalid_data(res, "market id required");
        }

        try {
            const market = await prisma.market.findUnique({
                where: { id: market_id },
                select: { id: true },
            });
            if (!market) return ResponseWriter.not_found(res, "market not found");

            // upsert keeps the request idempotent — bookmarking an already
            // bookmarked market is a no-op rather than a 409.
            await prisma.bookmark.upsert({
                where: { userId_marketId: { userId: user_id, marketId: market_id } },
                create: { userId: user_id, marketId: market_id },
                update: {},
            });

            const dto: BookmarkStatusDTO = { marketId: market_id, bookmarked: true };
            return ResponseWriter.success(res, dto, "Bookmarked");
        } catch (err) {
            console.error("[bookmarks/add]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
