import type { Request, Response } from "express";
import { z } from "zod";
import ResponseWriter from "../../services/service.response";
import TestFundService from "../../services/service.test-fund";

const body_schema = z.object({
    solLamports: z.coerce.number().int().nonnegative().optional(),
    usdcAmount: z.coerce.number().nonnegative().optional(),
});

export default class TestFundController {
    private static fund_service = new TestFundService();

    static async process(req: Request, res: Response) {
        const user_id = typeof req.params.userId === "string" ? req.params.userId : "";
        if (!user_id) return ResponseWriter.invalid_data(res, "userId required");

        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid fund payload");
        }

        if (!TestFundController.fund_service.is_configured()) {
            return ResponseWriter.error(
                res,
                "ADMIN_KEYPAIR_MISSING",
                "SERVER_SOLANA_ADMIN_KEYPAIR is not set",
                undefined,
                503,
            );
        }

        try {
            const result = await TestFundController.fund_service.fund({
                userId: user_id,
                solLamports: parsed.data.solLamports,
                usdcAmount: parsed.data.usdcAmount,
            });
            return ResponseWriter.success(res, result, "Funded");
        } catch (err) {
            console.error("[admin/test-fund]", err);
            const msg = err instanceof Error ? err.message : "fund failed";
            return ResponseWriter.error(res, "FUND_FAILED", msg, undefined, 500);
        }
    }
}
