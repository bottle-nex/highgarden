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

    /** Serialize provisional changes with settlement on the Market row. */
    private static async record_pending_state(
        market_id: string,
        winning_outcome: Outcome | null,
        resolved_at: Date | null,
        status: "OPEN" | "PAUSED" | "RESOLVED",
    ): Promise<ResolverStateRow> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Market" WHERE "id" = ${market_id} FOR UPDATE`;
            const existing = await tx.resolverState.findUnique({ where: { marketId: market_id } });
            if (existing?.stage === "SOLANA_RESOLVED" || existing?.stage === "REDEEMED") {
                await tx.market.update({
                    where: { id: market_id },
                    data: {
                        status: "RESOLVED",
                        winningOutcome: existing.winningOutcome,
                        resolvedAt: existing.solanaResolvedAt,
                        pausedReason: null,
                    },
                });
                return existing;
            }
            // A revised winner starts a new dispute window. Repeated observations
            // of the same result must not postpone settlement indefinitely.
            const timestamp =
                winning_outcome === null
                    ? null
                    : existing?.winningOutcome === winning_outcome
                      ? (existing.polymarketResolvedAt ?? resolved_at)
                      : existing
                        ? new Date()
                        : resolved_at;
            const data = {
                stage:
                    winning_outcome === null
                        ? ("PENDING" as const)
                        : ("POLYMARKET_RESOLVED" as const),
                winningOutcome: winning_outcome,
                polymarketResolvedAt: timestamp,
            };
            const row = await tx.resolverState.upsert({
                where: { marketId: market_id },
                create: { marketId: market_id, ...data },
                update: data,
            });
            await tx.market.update({
                where: { id: market_id },
                data: {
                    status,
                    winningOutcome: winning_outcome,
                    resolvedAt: timestamp,
                    pausedReason: status === "PAUSED" ? "UMA_DISPUTE" : null,
                },
            });
            return row;
        });
    }

    static async record_polymarket_resolved(
        market_id: string,
        winning_outcome: Outcome,
        resolved_at: Date,
    ): Promise<ResolverStateRow> {
        return Resolver.record_pending_state(market_id, winning_outcome, resolved_at, "RESOLVED");
    }

    /**
     * Returns markets ready for on-chain `resolve_market` submission.
     * Standard markets must have cleared the dispute window
     * (`polymarketResolvedAt <= max_resolved_at`); FAST_MOVING markets
     * (sub-hour ladders) bypass the window entirely — there's no UMA
     * dispute risk on those and the whole point is fast settlement so
     * the auto-resolver can be tested without 48h waits.
     *
     * No Market relation is defined on ResolverState, so the FAST_MOVING
     * bypass is applied in TS: pull every awaiting row, then look up its
     * `Market.kind` and keep it if either (a) it's FAST_MOVING or (b)
     * its `polymarketResolvedAt` is past the cutoff.
     */
    static async list_awaiting_solana_submission(
        max_resolved_at: Date,
    ): Promise<ResolverStateRow[]> {
        const rows = await prisma.resolverState.findMany({
            where: {
                stage: "POLYMARKET_RESOLVED",
                solanaResolveTxSig: null,
                winningOutcome: { not: null },
            },
        });
        if (rows.length === 0) return rows;
        const market_ids = rows.map((r) => r.marketId);
        const markets = await prisma.market.findMany({
            where: { id: { in: market_ids } },
            select: { id: true, kind: true },
        });
        const kind_by_id = new Map(markets.map((m) => [m.id, m.kind] as const));
        return rows.filter((r) => {
            if (kind_by_id.get(r.marketId) === "FAST_MOVING") return true;
            return r.polymarketResolvedAt !== null && r.polymarketResolvedAt <= max_resolved_at;
        });
    }

    /**
     * Advances a market into `SOLANA_RESOLVED`. Stores the on-chain
     * resolve tx signature so the row also serves as an audit trail.
     * Also repairs Market in the same transaction, including recovery when
     * the on-chain submission landed before the provisional DB write.
     */
    static async record_solana_resolved(
        market_id: string,
        tx_signature: string,
        resolved_at: Date,
        winning_outcome: Outcome,
    ): Promise<ResolverStateRow> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Market" WHERE "id" = ${market_id} FOR UPDATE`;
            const existing = await tx.resolverState.findUnique({ where: { marketId: market_id } });
            const settled = existing?.stage === "SOLANA_RESOLVED" || existing?.stage === "REDEEMED";
            const row = settled
                ? existing
                : await tx.resolverState.upsert({
                      where: { marketId: market_id },
                      create: {
                          marketId: market_id,
                          stage: "SOLANA_RESOLVED",
                          winningOutcome: winning_outcome,
                          solanaResolveTxSig: tx_signature,
                          solanaResolvedAt: resolved_at,
                      },
                      update: {
                          stage: "SOLANA_RESOLVED",
                          winningOutcome: winning_outcome,
                          solanaResolveTxSig: tx_signature,
                          solanaResolvedAt: resolved_at,
                      },
                  });
            await tx.market.update({
                where: { id: market_id },
                data: {
                    status: "RESOLVED",
                    winningOutcome: row.winningOutcome,
                    resolvedAt: row.solanaResolvedAt,
                    pausedReason: null,
                },
            });
            return row;
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

    /** Clear both provisional records when gamma reopens or becomes ambiguous. */
    static async revert_to_pending(market_id: string, paused = true): Promise<void> {
        await Resolver.record_pending_state(market_id, null, null, paused ? "PAUSED" : "OPEN");
    }

    static async update_winning_outcome(
        market_id: string,
        outcome: Outcome,
        resolved_at: Date,
    ): Promise<void> {
        await Resolver.record_polymarket_resolved(market_id, outcome, resolved_at);
    }
}
