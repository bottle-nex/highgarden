import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import ResponseWriter from "../../services/service.response";

export default class ReportCommentController {
    static async process(req: Request, res: Response) {
        const user_id = req.user?.id;
        if (!user_id) return ResponseWriter.not_authorized(res);

        const comment_id = typeof req.params.id === "string" ? req.params.id : "";
        if (!comment_id) {
            return ResponseWriter.invalid_data(res, "comment id required");
        }

        try {
            const result = await prisma.$transaction(async (tx) => {
                const comment = await tx.comment.findUnique({
                    where: { id: comment_id },
                    select: { id: true },
                });
                if (!comment) return null;

                const report = await tx.commentReport.createMany({
                    data: { commentId: comment_id, userId: user_id },
                    skipDuplicates: true,
                });
                if (report.count === 1) {
                    await tx.comment.update({
                        where: { id: comment_id },
                        data: { reportCount: { increment: 1 } },
                    });
                }
                return report.count === 0;
            });
            if (result === null) return ResponseWriter.not_found(res, "comment not found");

            return ResponseWriter.success(
                res,
                { reported: true, alreadyReported: result },
                result ? "Already reported" : "Comment reported",
            );
        } catch (err) {
            console.error("[comments/report]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
