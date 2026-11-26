import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import ResponseWriter from "../../services/service.response";
import { services } from "../..";

export default class DeleteCommentController {
    static async process(req: Request, res: Response) {
        const user_id = req.user?.id;
        if (!user_id) return ResponseWriter.not_authorized(res);

        const comment_id = typeof req.params.id === "string" ? req.params.id : "";
        if (!comment_id) return ResponseWriter.invalid_data(res, "comment id required");

        try {
            const comment = await prisma.comment.findFirst({
                where: { id: comment_id, userId: user_id },
                select: { eventId: true },
            });
            if (!comment) return ResponseWriter.not_found(res, "comment not found");

            const deleted = await prisma.comment.deleteMany({
                where: { id: comment_id, userId: user_id },
            });
            if (!deleted.count) return ResponseWriter.not_found(res, "comment not found");

            try {
                await services.market_lifecycle.publish_comment_deleted(
                    comment.eventId,
                    comment_id,
                );
            } catch (err) {
                console.error("[comments/delete] broadcast failed", err);
            }
            return ResponseWriter.success(res, { deleted: true }, "Comment deleted");
        } catch (err) {
            console.error("[comments/delete]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
