import type { Request, Response } from "express";
import {
    lock_market_for_pause,
    market_pause_transaction_options,
    prisma,
    type Prisma,
} from "@solmarket/database";
import { ENV } from "../../config/config.env";
import { services } from "../../index";
import ResponseWriter from "../../services/service.response";

const market_select = {
    id: true,
    name: true,
    status: true,
    endAt: true,
    solanaMarketPda: true,
    pausedReason: true,
    exposure: { select: { paused: true, pausedReason: true, unhedgedUsd: true } },
} satisfies Prisma.MarketSelect;

type PausedMarket = Prisma.MarketGetPayload<{ select: typeof market_select }>;
type ResumeEligibility = { marketPda: string } | { code: string; message: string; status: number };

function resume_eligibility(market: PausedMarket): ResumeEligibility {
    if (market.status !== "OPEN") {
        const message =
            market.pausedReason === "UMA_DISPUTE"
                ? "Polymarket controls reopening while the dispute is active."
                : "The market lifecycle prevents resuming trading.";
        return { code: "MARKET_NOT_OPEN", message, status: 409 };
    }
    if (!market.exposure?.paused) {
        return {
            code: "MARKET_NOT_PAUSED",
            message: "This market has no hedge pause.",
            status: 409,
        };
    }
    if (market.endAt.getTime() <= Date.now()) {
        return { code: "MARKET_ENDED", message: "This market has ended.", status: 409 };
    }
    if (!market.solanaMarketPda) {
        return {
            code: "MARKET_NOT_LISTED_ON_SOLANA",
            message: "This market has no Solana listing.",
            status: 409,
        };
    }
    if (!services.solana_admin.is_configured()) {
        return {
            code: "SOLANA_ADMIN_NOT_CONFIGURED",
            message: "The server's Solana admin signer is unavailable.",
            status: 503,
        };
    }
    return { marketPda: market.solanaMarketPda };
}

function at_exposure_cap(unhedged_usd: number): boolean {
    return Math.abs(unhedged_usd) >= ENV.SERVER_UNHEDGED_DELTA_CAP_USD;
}

export default class PausedMarketsController {
    static async list(_req: Request, res: Response) {
        try {
            const markets = await prisma.market.findMany({
                where: {
                    OR: [
                        { status: "PAUSED" },
                        { status: "OPEN", exposure: { is: { paused: true } } },
                    ],
                },
                select: market_select,
                orderBy: [{ name: "asc" }, { id: "asc" }],
            });
            const rows = markets.map((market) => {
                const reasons: string[] = [];
                if (market.status === "PAUSED") {
                    reasons.push(
                        market.pausedReason === "UMA_DISPUTE"
                            ? "Polymarket UMA dispute"
                            : market.pausedReason || "Market lifecycle pause",
                    );
                }
                if (market.exposure?.paused) {
                    reasons.push(market.exposure.pausedReason || "Hedge failure");
                }
                const unhedged_usd = market.exposure?.unhedgedUsd ?? 0;
                const eligibility = resume_eligibility(market);
                return {
                    marketId: market.id,
                    name: market.name,
                    reasons,
                    unhedgedUsd: unhedged_usd,
                    exposureCapReached: market.exposure !== null && at_exposure_cap(unhedged_usd),
                    resumeUnavailableReason: "code" in eligibility ? eligibility.message : null,
                };
            });
            return ResponseWriter.success(res, rows, "Paused markets");
        } catch (err) {
            console.error("[admin/paused-markets:list]", err);
            return ResponseWriter.system_error(res);
        }
    }

    static async resume(req: Request, res: Response) {
        const market_id = typeof req.params.marketId === "string" ? req.params.marketId : "";
        if (!market_id) return ResponseWriter.invalid_data(res, "marketId required");

        try {
            const result = await prisma.$transaction(async (tx) => {
                await lock_market_for_pause(tx, market_id);
                const market = await tx.market.findUnique({
                    where: { id: market_id },
                    select: market_select,
                });
                if (!market)
                    return { code: "MARKET_NOT_FOUND", message: "Market not found.", status: 404 };
                const eligibility = resume_eligibility(market);
                if ("code" in eligibility) return eligibility;

                if (!(await services.solana_admin.resume_market(eligibility.marketPda))) {
                    return {
                        code: "MARKET_NOT_OPEN_ON_SOLANA",
                        message: "This market is closed on Solana.",
                        status: 409,
                    };
                }
                const exposure = await tx.exposure.update({
                    where: { marketId: market_id },
                    data: { paused: false, pausedReason: null },
                    select: { unhedgedUsd: true },
                });
                return {
                    marketId: market_id,
                    exposureCapReached: at_exposure_cap(exposure.unhedgedUsd),
                };
            }, market_pause_transaction_options);
            if ("code" in result) {
                return ResponseWriter.error(
                    res,
                    result.code,
                    result.message,
                    undefined,
                    result.status,
                );
            }
            return ResponseWriter.success(res, result, "Hedge pause cleared");
        } catch (err) {
            console.error("[admin/paused-markets:resume]", { marketId: market_id, err });
            return ResponseWriter.error(
                res,
                "RESUME_FAILED",
                "Could not confirm that the hedge pause was cleared.",
            );
        }
    }
}
