import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus, type RecentTradeDTO, type Side, type Outcome } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export default class GetRecentTradesController {
    static async process(req: Request, res: Response) {
        const id = typeof req.params.id === "string" ? req.params.id : "";
        if (!id) {
            return ResponseWriter.invalid_data(res, "id required");
        }

        const raw_limit = typeof req.query.limit === "string" ? req.query.limit.trim() : "";
        const limit_param = Number(raw_limit || DEFAULT_LIMIT);
        const limit = Number.isFinite(limit_param)
            ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit_param)))
            : DEFAULT_LIMIT;

        try {
            const listing = await prisma.listing.findUnique({
                where: { marketId: id },
                select: { status: true, market: { select: { id: true } } },
            });
            if (!listing || listing.status !== ListingStatus.APPROVED || !listing.market) {
                return ResponseWriter.not_found(res, "market not found");
            }

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
