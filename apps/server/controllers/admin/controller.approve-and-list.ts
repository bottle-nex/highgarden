import type { Request, Response } from "express";
import { z } from "zod";
import ResponseWriter from "../../services/service.response";
import ApproveAndListService, {
    ApproveAndListError,
    type ApproveAndListErrorCode,
} from "../../services/service.approve-and-list";

const body_schema = z.object({
    approvedBy: z.string().nullish(),
});

const ERROR_HTTP_STATUS: Record<ApproveAndListErrorCode, number> = {
    LISTING_NOT_FOUND: 404,
    LISTING_NOT_PENDING: 409,
    MARKET_INCOMPLETE: 422,
    SOLANA_ADMIN_NOT_CONFIGURED: 503,
};

export default class ApproveAndListOnSolanaController {
    private static service = new ApproveAndListService();

    static async process(req: Request, res: Response) {
        const marketId = typeof req.params.marketId === "string" ? req.params.marketId : "";
        if (!marketId) return ResponseWriter.invalid_data(res, "marketId required");

        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid approve payload");
        }
        const approvedBy = parsed.data.approvedBy ?? null;

        try {
            const result = await ApproveAndListOnSolanaController.service.approve(
                marketId,
                approvedBy,
            );
            return ResponseWriter.success(
                res,
                result,
                "Listing approved and listed on Solana",
            );
        } catch (err) {
            if (err instanceof ApproveAndListError) {
                return ResponseWriter.error(
                    res,
                    err.code,
                    err.message,
                    undefined,
                    ERROR_HTTP_STATUS[err.code],
                );
            }
            console.error("[admin/approve-and-list]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
