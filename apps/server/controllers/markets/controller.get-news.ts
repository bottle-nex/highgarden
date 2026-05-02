import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";
import { services } from "../../index";

export default class GetMarketNewsController {
    static async process(req: Request, res: Response) {
        const id = typeof req.params.id === "string" ? req.params.id : "";
        if (!id) {
            return ResponseWriter.invalid_data(res, "id required");
        }

        try {
            // Only serve news for approved listings — same gating as
            // GET /markets/:id, so news doesn't leak the existence of pending
            // or rejected markets.
            const listing = await prisma.listing.findUnique({
                where: { marketId: id },
                include: { market: { select: { id: true, name: true } } },
            });
            if (!listing || listing.status !== ListingStatus.APPROVED || !listing.market) {
                return ResponseWriter.not_found(res, "market not found");
            }

            const articles = await services.news.news_for_market(listing.market);
            return ResponseWriter.success(res, articles, "Market news");
        } catch (err) {
            console.error("[markets/get-news]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
