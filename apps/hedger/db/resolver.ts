import { prisma } from "@solmarket/database";
import type { Outcome, ResolverStage } from "@solmarket/database";

/**
 * State of the multi-stage resolution lifecycle for one market.
 * Lifecycle: PENDING → POLYMARKET_RESOLVED → SOLANA_RESOLVED → REDEEMED.
 */
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

/**
 * Wraps the `ResolverState` table — the per-market row that tracks
 * the multi-stage lifecycle from "Polymarket settled" through to
 * "Polygon redeemed". Class-with-static-methods so callers read as
 * `Resolver.find(id)` / `Resolver.record_redeemed(...)`.
 *
 * Named `Resolver` (not `ResolverState`) for callsite ergonomics.
 * The matching service class is in `apps/hedger/resolver/index.ts`;
 * if a single file ever needs both, alias one on import.
 */
export default class Resolver {
    /**
     * Reads the resolver state row for a market. Returns null if no row
     * has been created yet — call {@link Resolver.ensure} first if you
     * need to guarantee existence.
     */
    static async find(market_id: string): Promise<ResolverStateRow | null> {
        return prisma.resolverState.findUnique({ where: { marketId: market_id } });
    }

    /**
     * Seed-or-noop the resolver state row. Used the first time a market
     * crosses the resolver loop's radar; mirrors the cursor's
     * upsert-with-empty-update idiom.
     */
    static async ensure(market_id: string): Promise<ResolverStateRow> {
        return prisma.resolverState.upsert({
            where: { marketId: market_id },
            create: { marketId: market_id },
            update: {},
        });
    }

    /**
     * Advances a market into `POLYMARKET_RESOLVED`, recording the winning
     * outcome and the resolved-at timestamp Polymarket reported. Idempotent:
     * re-calling for an already-resolved market overwrites the timestamp
     * and outcome, which is what we want if Polymarket revises (rare, but
     * the on-chain submission hasn't happened yet so it's safe).
     */
    static async record_polymarket_resolved(
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

    /**
     * Returns the markets where Polymarket has settled and the dispute
     * window has elapsed but we haven't yet forwarded the outcome on-chain.
     * `max_resolved_at` is "now − dispute_window" — only resolutions older
     * than the window are considered authoritative.
     */
    static async list_awaiting_solana_submission(
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

    /**
     * Advances a market into `SOLANA_RESOLVED`. Stores the on-chain
     * resolve tx signature so the row also serves as an audit trail.
     * Uses plain `update` (not upsert) because the row must already exist
     * — the resolver loop wouldn't have submitted to Solana for a row it
     * hadn't first marked POLYMARKET_RESOLVED.
     */
    static async record_solana_resolved(
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

    /**
     * Returns markets that have been resolved on-chain but whose CTF
     * tokens we haven't yet redeemed on Polygon. The resolver tick walks
     * these and calls `redeemPositions` for each.
     */
    static async list_awaiting_redemption(): Promise<ResolverStateRow[]> {
        return prisma.resolverState.findMany({
            where: { stage: "SOLANA_RESOLVED", polymarketRedeemTxHash: null },
        });
    }

    /**
     * Advances a market into the terminal `REDEEMED` stage. The Polygon
     * tx hash is stored as the audit trail.
     */
    static async record_redeemed(
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

    /**
     * Stamps a free-form note onto the resolver state row. Used by the
     * resolver to record human-readable diagnostics ("redeem skipped:
     * zero balance", "polymarket returned 5xx"). The notes field is
     * append-style by overwrite — ops should consult logs for the full
     * history; the row carries the most recent note as a quick triage
     * signal.
     */
    static async append_note(market_id: string, note: string): Promise<void> {
        await prisma.resolverState.upsert({
            where: { marketId: market_id },
            create: { marketId: market_id, notes: note },
            update: { notes: note },
        });
    }

    /**
     * UMA-dispute candidate sweep: every market that's been recorded as
     * POLYMARKET_RESOLVED but not yet submitted on Solana. Used by the
     * reconciler to recheck gamma in case the outcome got disputed.
     */
    static async list_polymarket_resolved_pending_solana(): Promise<ResolverStateRow[]> {
        return prisma.resolverState.findMany({
            where: { stage: "POLYMARKET_RESOLVED", solanaResolveTxSig: null },
        });
    }

    /**
     * Reverts a market to PENDING after the reconciler detects the
     * Polymarket resolution was disputed (gamma reports unclosed /
     * ambiguous). Clears the resolved-at timestamp and winning outcome
     * so a future tick treats it as fresh.
     */
    static async revert_to_pending(market_id: string): Promise<void> {
        await prisma.resolverState.update({
            where: { marketId: market_id },
            data: { stage: "PENDING", polymarketResolvedAt: null, winningOutcome: null },
        });
    }

    /**
     * Updates only the winning outcome — used when the reconciler detects
     * gamma flipped the answer between first detection and on-chain
     * submission. Stage stays POLYMARKET_RESOLVED.
     */
    static async update_winning_outcome(market_id: string, outcome: Outcome): Promise<void> {
        await prisma.resolverState.update({
            where: { marketId: market_id },
            data: { winningOutcome: outcome },
        });
    }
}
