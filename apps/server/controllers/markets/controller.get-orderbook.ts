import type { Request, Response } from "express";
import { prisma } from "@solmarket/database";
import {
    ListingStatus,
    Outcome,
    type OrderBookSnapshotDTO,
    type OrderBookStatus,
} from "@solmarket/types";
import { services } from "../../index";
import ResponseWriter from "../../services/service.response";

const DEFAULT_DEPTH = 10;
const MAX_DEPTH = 50;

export default class GetOrderBookController {
    static async process(req: Request, res: Response) {
        const id = typeof req.params.id === "string" ? req.params.id : "";
        if (!id) {
            return ResponseWriter.invalid_data(res, "id required");
        }

        const outcome_param = String(req.query.outcome ?? "").toUpperCase();
        if (outcome_param !== Outcome.YES && outcome_param !== Outcome.NO) {
            return ResponseWriter.invalid_data(res, "outcome must be YES or NO");
        }
        const outcome = outcome_param as Outcome;

        const depth_param = Number(req.query.depth ?? DEFAULT_DEPTH);
        const depth = Number.isFinite(depth_param)
            ? Math.min(MAX_DEPTH, Math.max(1, Math.floor(depth_param)))
            : DEFAULT_DEPTH;

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

            const p = listing.market.polymarket;
            const token_id = outcome === Outcome.YES ? p.yesTokenId : p.noTokenId;

            const tracked = services.book_cache.has_token(token_id);
            const depth_view = services.book_cache.get_depth(token_id, depth);
            const top = services.book_cache.getTopOfBook(token_id);

            let status: OrderBookStatus;
            if (!tracked) {
                status = "NOT_TRACKED";
                // Lazy-arm: opening the page asks the system to start mirroring
                // this market. Best-effort — the next refresh will see TRACKED.
                void services.mirror_control.subscribe([p.yesTokenId, p.noTokenId]).catch(() => {});
                void services.book_cache.track([p.yesTokenId, p.noTokenId]).catch(() => {});
                void services.token_index.write([
                    {
                        token_id: p.yesTokenId,
                        entry: {
                            marketId: listing.market.id,
                            marketName: listing.market.name,
                            outcome: "YES",
                        },
                    },
                    {
                        token_id: p.noTokenId,
                        entry: {
                            marketId: listing.market.id,
                            marketName: listing.market.name,
                            outcome: "NO",
                        },
                    },
                ]).catch(() => {});
            } else if ((depth_view?.bids.length ?? 0) === 0 && (depth_view?.asks.length ?? 0) === 0) {
                status = "TRACKED_EMPTY";
            } else {
                status = "TRACKED";
            }

            const dto: OrderBookSnapshotDTO = {
                marketId: id,
                outcome,
                tokenId: token_id,
                status,
                bids: depth_view?.bids ?? [],
                asks: depth_view?.asks ?? [],
                bestBid: top?.bestBid ?? null,
                bestAsk: top?.bestAsk ?? null,
                midPrice: top?.midPrice ?? null,
                updatedAt: top?.updatedAt ?? Date.now(),
            };

            return ResponseWriter.success(res, dto, "OrderBook");
        } catch (err) {
            console.error("[markets/get-orderbook]", err);
            return ResponseWriter.system_error(res);
        }
    }
}
