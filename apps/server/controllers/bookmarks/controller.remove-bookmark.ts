import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import type { BookmarkStatusDTO } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

export default class RemoveBookmarkController {
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
            // deleteMany is idempotent — removing a bookmark that doesn't
            // exist returns count: 0 instead of throwing P2025.
            await prisma.bookmark.deleteMany({
                where: { userId: user_id, marketId: market_id },
            });
            const dto: BookmarkStatusDTO = { marketId: market_id, bookmarked: false };
            return ResponseWriter.success(res, dto, "Bookmark removed");
        } catch (err) {
            console.error("[bookmarks/remove]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
