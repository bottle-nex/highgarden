import type { Request, Response } from "express";
import { z } from "zod";
import ResponseWriter from "../../services/service.response";
import SolanaTradeService from "../../services/service.solana-trade";

const signed_quote_schema = z.object({
    market: z.string(),
    side: z.number().int().min(0).max(1),
    outcome: z.number().int().min(0).max(1),
    price: z.number().int().min(1).max(99),
    size: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    nonceHex: z.string().length(32),
    signatureBase64: z.string(),
    signerPubkey: z.string(),
});

export default class PlaceOrderController {
    private static trade = new SolanaTradeService();

    static async process(req: Request, res: Response) {
        if (!req.user) return ResponseWriter.not_authorized(res);

        const market_id = typeof req.params.id === "string" ? req.params.id : "";
        if (!market_id) return ResponseWriter.invalid_data(res, "market id required");

        const parsed = signed_quote_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(
                res,
                `Invalid signed quote: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
            );
        }

        try {
            const result = await PlaceOrderController.trade.place_order({
                userId: req.user.id,
                marketDbId: market_id,
                signedQuote: parsed.data,
            });
            return ResponseWriter.success(res, result, "Order placed");
        } catch (err) {
            console.error("[markets/place-order]", err);
            const msg = err instanceof Error ? err.message : "place_order failed";
            return ResponseWriter.error(res, "PLACE_ORDER_FAILED", msg, undefined, 500);
        }
    }
}
