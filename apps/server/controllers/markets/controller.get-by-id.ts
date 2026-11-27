import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import { ListingStatus, type MarketDTO, type MarketStatus, type Outcome } from "@solmarket/types";
import ResponseWriter from "../../services/service.response";
import MarketSettlementService from "../../services/service.market-settlement";

export default class GetMarketByIdController {
    static async process(req: Request, res: Response) {
        const id = typeof req.params.id === "string" ? req.params.id : "";
        if (!id) {
            return ResponseWriter.invalid_data(res, "id required");
        }

        try {
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

            const m = listing.market;
            const p = listing.market.polymarket;
            const settlements = await MarketSettlementService.find_many([m.id]);
            const resolution = MarketSettlementService.project(m, settlements.get(m.id));
            const dto: MarketDTO = {
                id: m.id,
                name: m.name,
                description: m.description,
                endAt: m.endAt.toISOString(),
                status: resolution.status as MarketStatus,
                polyMarketId: m.polyMarketId,
                yesTokenId: p.yesTokenId,
                noTokenId: p.noTokenId,
                tickSize: p.tickSize,
                negRisk: p.negRisk,
                solanaMarketPda: m.solanaMarketPda,
                volume24hUsd: listing.volume24hUsd,
                liquidityUsd: listing.liquidityUsd,
                imageUrl: p.imageUrl,
                eventId: p.eventId,
                eventSlug: p.eventSlug,
                kind: m.kind,
                fastSeriesKey: m.fastSeriesKey,
                winningOutcome: resolution.winningOutcome as Outcome | null,
                resolvedAt: resolution.resolvedAt?.toISOString() ?? null,
                claimable: resolution.claimable,
                tags: p.tags,
            };

            return ResponseWriter.success(res, dto, "Market");
        } catch (err) {
            console.error("[markets/get-by-id]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
