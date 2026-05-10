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

/**
 * @deprecated Slated for removal in PR 5 (final). The hedge-first
 * orchestrator at `POST /api/v1/markets/:id/trade` (see
 * controller.trade.ts) replaces the two-call quote/place-order flow.
 * This controller stays around as the rollback path during migration —
 * delete only after the new endpoint has soaked in production for at
 * least a week with no rollback. SolanaTradeService itself is NOT
 * deprecated; the trade orchestrator still depends on it.
 */
export default class PlaceOrderController {
    private static trade = new SolanaTradeService();
    /** Print the deprecation banner at most once per server start so we
     *  don't spam logs in production where the legacy path is still hot. */
    private static deprecation_warned = false;

    static async process(req: Request, res: Response) {
        PlaceOrderController.warn_deprecated_once();
        PlaceOrderController.set_deprecation_headers(res);

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

    private static warn_deprecated_once(): void {
        if (PlaceOrderController.deprecation_warned) return;
        PlaceOrderController.deprecation_warned = true;
        console.warn(
            "[deprecated] POST /markets/:id/place-order — use POST /markets/:id/trade (PR 2/5 hedge-first endpoint). " +
                "This endpoint is slated for removal once the new flow has soaked in production. " +
                "Set NEXT_PUBLIC_USE_HEDGE_FIRST_TRADE=true on the web client to migrate.",
        );
    }

    private static set_deprecation_headers(res: Response): void {
        // RFC 8594 / draft-ietf-httpapi-deprecation-header. Clients can
        // detect via either header and migrate at their own pace.
        res.setHeader("Deprecation", "true");
        res.setHeader("Link", '</api/v1/markets/:id/trade>; rel="successor-version"');
    }
}
