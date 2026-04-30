import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { type RecentTradeDTO, type Side, type Outcome } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export default class GetRecentTradesController {
    static async process(req: Request, res: Response) {
        const id = typeof req.params.id === "string" ? req.params.id : "";
        if (!id) {
            return ResponseWriter.invalid_data(res, "id required");
        }

        const limit_param = Number(req.query.limit ?? DEFAULT_LIMIT);
        const limit = Number.isFinite(limit_param)
            ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit_param)))
            : DEFAULT_LIMIT;

        try {
            const fills = await prisma.fill.findMany({
                where: { marketId: id },
                orderBy: { createdAt: "desc" },
                take: limit,
            });

            const trades: RecentTradeDTO[] = fills.map((f) => ({
                id: f.id,
                side: f.side as Side,
                outcome: f.outcome as Outcome,
                price: f.price,
                size: f.size,
                solanaTxSig: f.solanaTxSig,
                createdAt: f.createdAt.toISOString(),
            }));

            return ResponseWriter.success(res, trades, "RecentTrades");
        } catch (err) {
            console.error("[markets/get-recent-trades]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
