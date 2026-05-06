import { prisma } from "@solmarket/database";
import type { Outcome, ResolverStage } from "@solmarket/database";

/**
 * Hedger-shaped projection of `Market` joined with `PolymarketMarket`.
 * Flattens the join so the hedger never has to navigate the relation —
 * it just reads `yesTokenId` directly off the row.
 */
export interface MarketMetadata {
  id: string;
  polyMarketId: string;
  yesTokenId: string;
  noTokenId: string;
  tickSize: string;
  negRisk: boolean;
  solanaMarketPda: string | null;
}

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
 * Repository for `Market` plus its `ResolverState` companion row. We
 * fold both Prisma models into one repo because they describe the same
 * logical thing — a market and its lifecycle. Splitting them would
 * force the resolver to coordinate across two repos for one operation
 * (e.g. "look up the market, advance its resolver state").
 *
 * Naming convention: methods that work on `Market` use no prefix;
 * methods that work on `ResolverState` are prefixed `resolver_*`.
 */
export default class MarketRepo {
  // ──────────────── Market lookups ────────────────

  /**
   * Looks up a market by the on-chain Solana PDA. Used by the hedge
   * processor to translate an `OrderFilled` event's `market` field
   * (which is a PDA) into the corresponding DB market row plus its
   * Polymarket token ids.
   */
  public async find_by_solana_pda(pda: string): Promise<MarketMetadata | null> {
    const row = await prisma.market.findFirst({
      where: { solanaMarketPda: pda },
      include: { polymarket: true },
    });
    return row ? this.shape(row) : null;
  }

  /**
   * Reverse lookup by Polymarket conditionId. Used by the resolver loop
   * when it finds a settled Polymarket market and needs to find the
   * corresponding Solana market to forward the outcome to.
   */
  public async find_by_polymarket_id(polymarket_id: string): Promise<MarketMetadata | null> {
    const row = await prisma.market.findFirst({
      where: { polyMarketId: polymarket_id },
      include: { polymarket: true },
    });
    return row ? this.shape(row) : null;
  }

  /**
   * Lists every market the hedger should consider (those with a Solana
   * PDA — markets that have been deployed on-chain). Used by the
   * resolver and reconciler loops as the starting set per tick.
   */
  public async list_active(): Promise<MarketMetadata[]> {
    const rows = await prisma.market.findMany({
      where: { solanaMarketPda: { not: null } },
      include: { polymarket: true },
    });
    return rows.map((row) => this.shape(row));
  }

  // ──────────────── ResolverState (lifecycle) ────────────────

  /**
   * Reads the resolver state row for a market. Returns null if no row
   * has been created yet — call {@link resolver_ensure} first if you
   * need to guarantee existence.
   */
  public async resolver_find(market_id: string): Promise<ResolverStateRow | null> {
    return prisma.resolverState.findUnique({ where: { marketId: market_id } });
  }

  /**
   * Seed-or-noop the resolver state row. Used the first time a market
   * crosses the resolver loop's radar; mirrors the cursor's
   * upsert-with-empty-update idiom.
   */
  public async resolver_ensure(market_id: string): Promise<ResolverStateRow> {
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
  public async resolver_record_polymarket_resolved(
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
  public async resolver_list_awaiting_solana_submission(
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
  public async resolver_record_solana_resolved(
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
  public async resolver_list_awaiting_redemption(): Promise<ResolverStateRow[]> {
    return prisma.resolverState.findMany({
      where: { stage: "SOLANA_RESOLVED", polymarketRedeemTxHash: null },
    });
  }

  /**
   * Advances a market into the terminal `REDEEMED` stage. The Polygon
   * tx hash is stored as the audit trail.
   */
  public async resolver_record_redeemed(
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
  public async resolver_append_note(market_id: string, note: string): Promise<void> {
    await prisma.resolverState.upsert({
      where: { marketId: market_id },
      create: { marketId: market_id, notes: note },
      update: { notes: note },
    });
  }

  // ──────────────── Internals ────────────────

  private shape(row: {
    id: string;
    polyMarketId: string;
    solanaMarketPda: string | null;
    polymarket: {
      id: string;
      yesTokenId: string;
      noTokenId: string;
      tickSize: string;
      negRisk: boolean;
    };
  }): MarketMetadata {
    return {
      id: row.id,
      polyMarketId: row.polyMarketId,
      yesTokenId: row.polymarket.yesTokenId,
      noTokenId: row.polymarket.noTokenId,
      tickSize: row.polymarket.tickSize,
      negRisk: row.polymarket.negRisk,
      solanaMarketPda: row.solanaMarketPda,
    };
  }
}
