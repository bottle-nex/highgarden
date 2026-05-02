import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import ResponseWriter from "../../services/service.response";
import { services } from "../..";

const REPORT_DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export default class ReportCommentController {
    static async process(req: Request, res: Response) {
        const user_id = req.user?.id;
        if (!user_id) return ResponseWriter.not_authorized(res);

        const comment_id = typeof req.params.id === "string" ? req.params.id : "";
        if (!comment_id) {
            return ResponseWriter.invalid_data(res, "comment id required");
        }

        try {
            const dedupe_key = `comment:report:${comment_id}:${user_id}`;
            const already = await services.redis.get(dedupe_key);
            if (already) {
                return ResponseWriter.success(
                    res,
                    { reported: true, alreadyReported: true },
                    "Already reported",
                );
            }

            const comment = await prisma.comment.findUnique({
                where: { id: comment_id },
                select: { id: true },
            });
            if (!comment) return ResponseWriter.not_found(res, "comment not found");

            await prisma.comment.update({
                where: { id: comment_id },
                data: { reportCount: { increment: 1 } },
            });
            await services.redis.set(dedupe_key, "1", "EX", REPORT_DEDUPE_TTL_SECONDS);

            return ResponseWriter.success(
                res,
                { reported: true, alreadyReported: false },
                "Comment reported",
            );
        } catch (err) {
            console.error("[comments/report]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
