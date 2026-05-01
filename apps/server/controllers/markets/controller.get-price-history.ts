import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus, type PriceHistoryDTO, type PriceHistoryRange } from "@solmarket/types";
import { services } from "../../index";
import ResponseWriter from "../../services/service.response";

const VALID_RANGES: ReadonlyArray<PriceHistoryRange> = ["1h", "6h", "1d", "1w", "1m", "all"];

export default class GetPriceHistoryController {
    static async process(req: Request, res: Response) {
        const id = typeof req.params.id === "string" ? req.params.id : "";
        if (!id) {
            return ResponseWriter.invalid_data(res, "id required");
        }

        const range_param = String(req.query.range ?? "1d") as PriceHistoryRange;
        if (!VALID_RANGES.includes(range_param)) {
            return ResponseWriter.invalid_data(res, "invalid range");
        }

        try {
            const cache_key = `${id}:${range_param}`;
            const cached = services.price_history_cache.get(cache_key);
            if (cached) {
                return ResponseWriter.success(res, cached, "PriceHistory");
            }

            const listing = await prisma.listing.findUnique({
                where: { marketId: id },
                include: { market: { include: { polymarket: true } } },
            });

            if (
                !listing ||
                listing.status !== ListingStatus.APPROVED ||
                !listing.market ||
                !listing.market.polymarket
            ) {
                return ResponseWriter.not_found(res, "market not found");
            }

            const token_id = listing.market.polymarket.yesTokenId;
            const history = await services.clob.fetch_price_history(token_id, range_param);

            const dto: PriceHistoryDTO = {
                marketId: id,
                tokenId: token_id,
                range: range_param,
                history,
            };

            services.price_history_cache.set(cache_key, dto);
            return ResponseWriter.success(res, dto, "PriceHistory");
        } catch (err) {
            console.error("[markets/get-price-history]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
