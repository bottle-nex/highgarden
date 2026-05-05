import type { Request, Response } from "express";
import ResponseWriter from "../../services/service.response";
import SolanaClaimService, { ClaimError } from "../../services/service.solana-claim";

export default class ClaimController {
    private static service = new SolanaClaimService();

    static async process(req: Request, res: Response) {
        if (!req.user) return ResponseWriter.not_authorized(res);

        const market_id = typeof req.params.id === "string" ? req.params.id : "";
        if (!market_id) return ResponseWriter.invalid_data(res, "market id required");

        try {
            const result = await ClaimController.service.claim({
                userId: req.user.id,
                marketDbId: market_id,
            });
            return ResponseWriter.success(res, result, "Claimed");
        } catch (err) {
            if (err instanceof ClaimError) {
                return ResponseWriter.error(res, err.code, err.message, undefined, 409);
            }
            console.error("[markets/claim]", err);
            const msg = err instanceof Error ? err.message : "claim failed";
            return ResponseWriter.error(res, "CLAIM_FAILED", msg, undefined, 500);
        }
    }
}
