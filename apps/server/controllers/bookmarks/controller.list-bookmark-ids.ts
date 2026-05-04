import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import ResponseWriter from "../../services/service.response";

export default class ListBookmarkIdsController {
    static async process(req: Request, res: Response) {
        const user_id = req.user?.id;
        if (!user_id) {
            return ResponseWriter.not_authorized(res);
        }

        try {
            const rows = await prisma.bookmark.findMany({
                where: { userId: user_id },
                select: { marketId: true },
            });
            const ids = rows.map((r) => r.marketId);
            return ResponseWriter.success(res, ids, "Bookmark ids");
        } catch (err) {
            console.error("[bookmarks/list-ids]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
