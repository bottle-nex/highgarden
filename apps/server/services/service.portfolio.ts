import { prisma } from "@solmarket/database";
import {
    type FillDTO,
    type PositionDTO,
    type PositionStatus,
    Outcome,
    MarketStatus,
} from "@solmarket/types";
import { services } from "../index";
import SpreadService from "./service.spread";

const FILL_HISTORY_LIMIT = 100;

interface FillRow {
    id: string;
    marketId: string;
    side: "BUY" | "SELL";
    outcome: "YES" | "NO";
    price: number;
    size: number;
    solanaTxSig: string;
    createdAt: Date;
    market: {
        id: string;
        name: string;
        status: "OPEN" | "PAUSED" | "RESOLVED" | "CANCELLED";
        winningOutcome: "YES" | "NO" | null;
        endAt: Date;
        polymarket: {
            yesTokenId: string;
            noTokenId: string;
            imageUrl: string | null;
        };
    };
}

interface OutcomeAggregate {
    shares: number;
    avgCostCents: number;
}

export default class PortfolioService {
    public async list_positions(user_id: string): Promise<PositionDTO[]> {
        const fills = await PortfolioService.fetch_user_fills(user_id);
        const grouped = PortfolioService.group_by_market(fills);

        const positions: PositionDTO[] = [];
        for (const [, market_fills] of grouped) {
            const first = market_fills[0]!;
            const yes_agg = PortfolioService.aggregate_outcome(market_fills, "YES");
            const no_agg = PortfolioService.aggregate_outcome(market_fills, "NO");

            const yes_price = PortfolioService.current_price_cents(
                first.market.polymarket.yesTokenId,
            );
            const no_price = PortfolioService.current_price_cents(
                first.market.polymarket.noTokenId,
            );

            if (yes_agg.shares > 0) {
                positions.push(
                    PortfolioService.build_position(first, "YES", yes_agg, yes_price),
                );
            }
            if (no_agg.shares > 0) {
                positions.push(PortfolioService.build_position(first, "NO", no_agg, no_price));
            }
        }
        return positions;
    }

    public async list_fills(user_id: string): Promise<FillDTO[]> {
        const fills = await prisma.fill.findMany({
            where: { userId: user_id },
            orderBy: { createdAt: "desc" },
            take: FILL_HISTORY_LIMIT,
            include: { market: { select: { name: true } } },
        });
        return fills.map((f) => ({
            id: f.id,
            marketId: f.marketId,
            marketName: f.market.name,
            side: f.side as FillDTO["side"],
            outcome: f.outcome as FillDTO["outcome"],
            priceCents: f.price,
            size: f.size,
            txSig: f.solanaTxSig,
            createdAt: f.createdAt.toISOString(),
        }));
    }

    private static async fetch_user_fills(user_id: string): Promise<FillRow[]> {
        return prisma.fill.findMany({
            where: { userId: user_id },
            orderBy: { createdAt: "asc" },
            include: {
                market: {
                    include: {
                        polymarket: {
                            select: { yesTokenId: true, noTokenId: true, imageUrl: true },
                        },
                    },
                },
            },
        }) as unknown as Promise<FillRow[]>;
    }

    private static group_by_market(fills: FillRow[]): Map<string, FillRow[]> {
        const map = new Map<string, FillRow[]>();
        for (const f of fills) {
            const list = map.get(f.marketId) ?? [];
            list.push(f);
            map.set(f.marketId, list);
        }
        return map;
    }

    private static aggregate_outcome(
        fills: FillRow[],
        outcome: "YES" | "NO",
    ): OutcomeAggregate {
        let shares = 0;
        let avg = 0;
        for (const f of fills) {
            if (f.outcome !== outcome) continue;
            if (f.side === "BUY") {
                const total = shares + f.size;
                avg = total === 0 ? 0 : (avg * shares + f.price * f.size) / total;
                shares = total;
            } else {
                shares = Math.max(0, shares - f.size);
                if (shares === 0) avg = 0;
            }
        }
        return { shares, avgCostCents: Math.round(avg) };
    }

    private static current_price_cents(token_id: string): number | null {
        const top = services.book_cache.getTopOfBook(token_id);
        if (!top) return null;
        const shifted = SpreadService.shift_top(top.bestBid ?? null, "BID");
        if (shifted === null) return null;
        return Math.round(shifted * 100);
    }

    private static build_position(
        sample: FillRow,
        outcome: "YES" | "NO",
        agg: OutcomeAggregate,
        current_cents: number | null,
    ): PositionDTO {
        const m = sample.market;
        const status = PortfolioService.position_status(m.status, m.winningOutcome, outcome);
        const traded_usd = (agg.avgCostCents * agg.shares) / 100;
        const to_win_usd = agg.shares;
        const claimable_usd = status === "WON" ? agg.shares : 0;
        const value_usd =
            status === "WON"
                ? agg.shares
                : status === "LOST"
                  ? 0
                  : current_cents !== null
                    ? (current_cents * agg.shares) / 100
                    : traded_usd;

        return {
            marketId: m.id,
            marketName: m.name,
            marketImage: m.polymarket.imageUrl,
            marketStatus: m.status as MarketStatus,
            winningOutcome: m.winningOutcome as Outcome | null,
            endAt: m.endAt.toISOString(),
            outcome: outcome as Outcome,
            shares: agg.shares,
            avgCostCents: agg.avgCostCents,
            currentPriceCents: current_cents,
            tradedUsd: +traded_usd.toFixed(2),
            toWinUsd: +to_win_usd.toFixed(2),
            valueUsd: +value_usd.toFixed(2),
            status,
            claimableUsd: +claimable_usd.toFixed(2),
        };
    }

    private static position_status(
        market_status: FillRow["market"]["status"],
        winning: "YES" | "NO" | null,
        outcome: "YES" | "NO",
    ): PositionStatus {
        if (market_status !== "RESOLVED") return "OPEN";
        if (winning === null) return "OPEN";
        return winning === outcome ? "WON" : "LOST";
    }
}
