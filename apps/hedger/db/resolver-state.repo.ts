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

    public async list_awaiting_solana_submission(
        max_resolved_at: Date,
    ): Promise<ResolverStateRow[]> {
        return prisma.resolverState.findMany({
            where: {
                stage: "POLYMARKET_RESOLVED",
                polymarketResolvedAt: { lte: max_resolved_at },
                solanaResolveTxSig: null,
                winningOutcome: { not: null },
            },
        });
    }

    public async record_solana_resolved(
        market_id: string,
        tx_signature: string,
        resolved_at: Date,
    ): Promise<ResolverStateRow> {
        return prisma.resolverState.update({
            where: { marketId: market_id },
            data: {
                stage: "SOLANA_RESOLVED",
                solanaResolveTxSig: tx_signature,
                solanaResolvedAt: resolved_at,
            },
        });
    }

    public async list_awaiting_redemption(): Promise<ResolverStateRow[]> {
        return prisma.resolverState.findMany({
            where: {
                stage: "SOLANA_RESOLVED",
                polymarketRedeemTxHash: null,
            },
        });
    }

    public async record_redeemed(
        market_id: string,
        tx_hash: string,
        redeemed_at: Date,
    ): Promise<ResolverStateRow> {
        return prisma.resolverState.update({
            where: { marketId: market_id },
            data: {
                stage: "REDEEMED",
                polymarketRedeemTxHash: tx_hash,
                polymarketRedeemedAt: redeemed_at,
            },
        });
    }

    public async mark_redeem_skipped(market_id: string, reason: string): Promise<ResolverStateRow> {
        return prisma.resolverState.update({
            where: { marketId: market_id },
            data: { notes: `redeem_skipped: ${reason}` },
        });
    }
}
