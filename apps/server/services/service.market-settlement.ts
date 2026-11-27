import { prisma } from "@solmarket/database";
import type { MarketStatus, Outcome } from "@solmarket/database";

interface SettlementRow {
    stage: string;
    winningOutcome: Outcome | null;
    solanaResolvedAt: Date | null;
}

interface MarketResolution {
    status: MarketStatus;
    winningOutcome: Outcome | null;
    resolvedAt: Date | null;
}

/** Shared projection for claim eligibility and the final on-chain winner. */
export default class MarketSettlementService {
    static async find_many(market_ids: string[]): Promise<Map<string, SettlementRow>> {
        if (market_ids.length === 0) return new Map();
        const rows = await prisma.resolverState.findMany({
            where: { marketId: { in: market_ids } },
            select: { marketId: true, stage: true, winningOutcome: true, solanaResolvedAt: true },
        });
        return new Map(rows.map((row) => [row.marketId, row]));
    }

    static project(
        market: MarketResolution,
        settlement?: SettlementRow,
    ): MarketResolution & { claimable: boolean } {
        const claimable =
            (settlement?.stage === "SOLANA_RESOLVED" || settlement?.stage === "REDEEMED") &&
            settlement.winningOutcome !== null;
        return {
            status: claimable ? "RESOLVED" : market.status,
            winningOutcome: claimable ? settlement.winningOutcome : market.winningOutcome,
            resolvedAt: claimable ? settlement.solanaResolvedAt : market.resolvedAt,
            claimable,
        };
    }
}
