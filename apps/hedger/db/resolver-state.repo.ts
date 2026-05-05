import { prisma } from "@solmarket/database";
import type { Outcome, ResolverStage } from "@solmarket/database";

export interface ResolverStateRow {
    marketId: string;
    stage: ResolverStage;
    polymarketResolvedAt: Date | null;
    winningOutcome: Outcome | null;
    solanaResolveTxSig: string | null;
    solanaResolvedAt: Date | null;
    polymarketRedeemedAt: Date | null;
    polymarketRedeemTxHash: string | null;
    notes: string | null;
}

export default class ResolverStateRepo {
    public async find(market_id: string): Promise<ResolverStateRow | null> {
        return prisma.resolverState.findUnique({ where: { marketId: market_id } });
    }

    public async ensure(market_id: string): Promise<ResolverStateRow> {
        return prisma.resolverState.upsert({
            where: { marketId: market_id },
            create: { marketId: market_id },
            update: {},
        });
    }

    public async record_polymarket_resolved(
        market_id: string,
        winning_outcome: Outcome,
        resolved_at: Date,
    ): Promise<ResolverStateRow> {
        return prisma.resolverState.upsert({
            where: { marketId: market_id },
            create: {
                marketId: market_id,
                stage: "POLYMARKET_RESOLVED",
                polymarketResolvedAt: resolved_at,
                winningOutcome: winning_outcome,
            },
            update: {
                stage: "POLYMARKET_RESOLVED",
                polymarketResolvedAt: resolved_at,
                winningOutcome: winning_outcome,
            },
        });
    }

    public async append_note(market_id: string, note: string): Promise<void> {
        await prisma.resolverState.upsert({
            where: { marketId: market_id },
            create: { marketId: market_id, notes: note },
            update: { notes: note },
        });
    }
}
