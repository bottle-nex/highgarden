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
            const comment = await prisma.comment.findUnique({
                where: { id: comment_id },
                select: { id: true },
            });
            if (!comment) return ResponseWriter.not_found(res, "comment not found");

            const already_reported = await prisma.$transaction(async (tx) => {
                const result = await tx.commentReport.createMany({
                    data: [{ userId: user_id, commentId: comment_id }],
                    skipDuplicates: true,
                });
                if (result.count === 0) return true;

                await tx.comment.update({
                    where: { id: comment_id },
                    data: { reportCount: { increment: 1 } },
                });
                return false;
            });

            return ResponseWriter.success(
                res,
                { reported: true, alreadyReported: already_reported },
                already_reported ? "Already reported" : "Comment reported",
            );
        } catch (err) {
            console.error("[comments/report]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
