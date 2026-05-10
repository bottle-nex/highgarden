import type { Request, Response } from "express";
import { z } from "zod";
import ResponseWriter from "../../services/service.response";
import TradeOrchestratorService, { TradeError } from "../../services/service.trade-orchestrator";
import { ENV } from "../../config/config.env";
import { services } from "../../index";

const body_schema = z.object({
    side: z.enum(["BUY", "SELL"]),
    outcome: z.enum(["YES", "NO"]),
    size: z.coerce.number().int().positive(),
    /** Optional client-supplied UUID for idempotency. */
    requestId: z.string().min(8).max(80).optional(),
});

/**
 * Hedge-first trade endpoint. Single round-trip: server places the
 * Polymarket hedge synchronously, then commits on Solana with the actual
 * fill data. Disabled by default behind `SERVER_TRADE_ENDPOINT_ENABLED`.
 *
 * Flow lives in {@link TradeOrchestratorService}; this controller is a thin
 * adapter that maps validation + orchestrator errors to HTTP responses
 * and serves cached results for repeated requestIds.
 */
export default class TradeController {
    private static orchestrator = new TradeOrchestratorService();

    static async process(req: Request, res: Response) {
        if (!ENV.SERVER_TRADE_ENDPOINT_ENABLED) {
            return ResponseWriter.error(
                res,
                "TRADE_ENDPOINT_DISABLED",
                "hedge-first trade endpoint is disabled — set SERVER_TRADE_ENDPOINT_ENABLED=true",
                undefined,
                503,
            );
        }
        if (!req.user) return ResponseWriter.not_authorized(res);

        const market_id = typeof req.params.id === "string" ? req.params.id : "";
        if (!market_id) return ResponseWriter.invalid_data(res, "market id required");

        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            const issue = parsed.error.issues[0]?.message ?? "invalid trade body";
            return ResponseWriter.invalid_data(res, `Invalid trade payload: ${issue}`);
        }

        return TradeController.run_with_idempotency(req.user.id, market_id, parsed.data, res);
    }

    private static async run_with_idempotency(
        user_id: string,
        market_id: string,
        body: z.infer<typeof body_schema>,
        res: Response,
    ): Promise<void> {
        const request_id = body.requestId ?? crypto.randomUUID();
        const claim = await services.trade_idempotency.claim(request_id);

        if (claim.kind === "completed") {
            res.status(claim.result.status).json(claim.result.body);
            return;
        }
        if (claim.kind === "in_flight") {
            ResponseWriter.error(
                res,
                "DUPLICATE_REQUEST",
                "a trade with this requestId is already in flight",
                undefined,
                409,
            );
            return;
        }

        await TradeController.execute_trade(user_id, market_id, body, request_id, res);
    }

    private static async execute_trade(
        user_id: string,
        market_id: string,
        body: z.infer<typeof body_schema>,
        request_id: string,
        res: Response,
    ): Promise<void> {
        try {
            const result = await TradeController.orchestrator.execute({
                userId: user_id,
                marketDbId: market_id,
                side: body.side,
                outcome: body.outcome,
                sizeShares: body.size,
                requestId: request_id,
            });
            const response_body = TradeController.build_success_body(result);
            await services.trade_idempotency.complete(request_id, {
                status: 200,
                body: response_body,
            });
            res.status(200).json(response_body);
        } catch (err) {
            await TradeController.handle_failure(err, request_id, res);
        }
    }

    private static async handle_failure(
        err: unknown,
        request_id: string,
        res: Response,
    ): Promise<void> {
        if (err instanceof TradeError) {
            const body = TradeController.build_error_body(err);
            await services.trade_idempotency.complete(request_id, {
                status: err.status,
                body,
            });
            res.status(err.status).json(body);
            return;
        }
        console.error("[markets/trade]", err);
        // Don't cache unknown errors — let the user retry cleanly.
        await services.trade_idempotency.release(request_id);
        ResponseWriter.system_error(res);
    }

    private static build_success_body(result: {
        txSignature: string;
        polymarketOrderId: string;
        filledShares: number;
        pricePaidCents: number;
        totalUsd: number;
        requestId: string;
        nettedFromInventory: boolean;
    }) {
        return {
            success: true,
            data: result,
            message: "Trade executed",
            meta: { timestamp: new Date().toISOString() },
        };
    }

    private static build_error_body(err: TradeError) {
        return {
            success: false,
            message: err.message,
            error: { code: err.code },
            meta: { timestamp: new Date().toISOString() },
        };
    }
}
