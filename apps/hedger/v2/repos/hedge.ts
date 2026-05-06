import { prisma } from "@solmarket/database";
import type { HedgeStatus, Side, Outcome } from "@solmarket/database";

/**
 * Args for inserting a `Fill` row idempotently. The hex nonce is the
 * dedupe key — generated on-chain per fill and is what makes
 * "see same fill twice" safe across the listener and poller paths.
 */
export interface InsertFillParams {
  nonceHex: string;
  txSignature: string;
  userId: string;
  marketId: string;
  side: Side;
  outcome: Outcome;
  priceCents: number;
  sizeShares: number;
}

export interface FillRow {
  id: string;
  nonce: string;
  userId: string;
  marketId: string;
  side: Side;
  outcome: Outcome;
  price: number;
  size: number;
  solanaTxSig: string;
}

/**
 * Args for creating a `Hedge` row idempotently. Always tied to a
 * specific `Fill` (1:1) so we can reverse-lookup either way.
 */
export interface CreateHedgeParams {
  fillId: string;
  bullJobId: string;
  clientOrderId: string;
  polymarketTokenId: string;
  polymarketSide: Side;
  requestedSize: number;
}

export interface HedgeRow {
  id: string;
  fillId: string;
  status: HedgeStatus;
  bullJobId: string | null;
  clientOrderId: string | null;
  polymarketOrderId: string | null;
  polymarketTokenId: string | null;
  polymarketSide: Side | null;
  requestedSize: number | null;
  filledSize: number;
  avgPrice: number | null;
  attempts: number;
  lastError: string | null;
}

export interface ExposureRow {
  marketId: string;
  unhedgedUsd: number;
  trackerEnabled: boolean;
  paused: boolean;
}

/**
 * Repository covering three Prisma models that always travel together
 * in the hedger's hot path: `Fill`, `Hedge`, and `Exposure`. A fill
 * always has exactly one hedge; a hedge always changes exposure on the
 * fill's market. Splitting these into three repos would force the
 * processor to thread state across three handles for what is conceptually
 * one transaction.
 *
 * Naming: `Fill` methods are prefixed `fill_*`, `Hedge` methods are
 * prefixed `hedge_*`, `Exposure` methods `exposure_*`.
 */
export default class HedgeRepo {
  // ──────────────── Fills ────────────────

  /**
   * Looks up a fill by its on-chain nonce (hex). The nonce is unique
   * per fill (the on-chain program enforces this), so this is the
   * dedupe primitive both the queue (job id) and the DB (this lookup)
   * lean on.
   */
  public async fill_find_by_nonce(nonce_hex: string): Promise<FillRow | null> {
    const row = await prisma.fill.findUnique({ where: { nonce: nonce_hex } });
    return this.shape_fill(row);
  }

  /**
   * Inserts a fill if absent, otherwise returns the existing row. The
   * try/catch on `P2002` (Prisma's unique-constraint violation code)
   * handles the race where two callers (live listener + poller, or two
   * worker retries) both insert the same nonce — the loser falls back
   * to a fresh lookup.
   *
   * Returns `created` so the caller can tell first-time vs replay (used
   * by the processor to decide whether to bump exposure).
   */
  public async fill_insert_idempotent(
    params: InsertFillParams,
  ): Promise<{ row: FillRow; created: boolean }> {
    const existing = await this.fill_find_by_nonce(params.nonceHex);
    if (existing) return { row: existing, created: false };

    try {
      const created = await prisma.fill.create({
        data: {
          userId: params.userId,
          marketId: params.marketId,
          side: params.side,
          outcome: params.outcome,
          price: params.priceCents,
          size: params.sizeShares,
          solanaTxSig: params.txSignature,
          nonce: params.nonceHex,
        },
      });
      const shaped = this.shape_fill(created);
      if (!shaped) throw new Error("fill_insert: shape returned null after create");
      return { row: shaped, created: true };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        const row = await this.fill_find_by_nonce(params.nonceHex);
        if (row) return { row, created: false };
      }
      throw err;
    }
  }

  // ──────────────── Hedges ────────────────

  public async hedge_find_by_fill_id(fill_id: string): Promise<HedgeRow | null> {
    return prisma.hedge.findUnique({ where: { fillId: fill_id } });
  }

  public async hedge_find_by_bull_job_id(job_id: string): Promise<HedgeRow | null> {
    return prisma.hedge.findUnique({ where: { bullJobId: job_id } });
  }

  /**
   * Returns hedges left in IN_PROGRESS-ish states from a previous boot.
   * Used by `Hedger.recover_in_flight` at startup to either re-enqueue
   * or terminate them. Includes PENDING (never started) and HEDGING (in
   * the middle of an attempt that crashed).
   */
  public async hedge_find_in_progress(): Promise<HedgeRow[]> {
    return prisma.hedge.findMany({
      where: { status: { in: ["PENDING", "HEDGING"] } },
    });
  }

  /**
   * Inserts a hedge if absent, otherwise returns the existing row. Same
   * P2002 race handling as `fill_insert_idempotent`. The returned
   * `created` flag is rarely consulted — most callers use this purely
   * as "give me the hedge for this fill, creating one if needed."
   */
  public async hedge_create_idempotent(
    params: CreateHedgeParams,
  ): Promise<{ row: HedgeRow; created: boolean }> {
    const existing = await this.hedge_find_by_fill_id(params.fillId);
    if (existing) return { row: existing, created: false };

    try {
      const created = await prisma.hedge.create({
        data: {
          fillId: params.fillId,
          bullJobId: params.bullJobId,
          clientOrderId: params.clientOrderId,
          polymarketTokenId: params.polymarketTokenId,
          polymarketSide: params.polymarketSide,
          requestedSize: params.requestedSize,
          status: "PENDING",
        },
      });
      return { row: created, created: true };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        const row = await this.hedge_find_by_fill_id(params.fillId);
        if (row) return { row, created: false };
      }
      throw err;
    }
  }

  /**
   * Marks a hedge as in-flight and bumps the attempt counter. Called at
   * the start of each worker attempt so a partial failure leaves the
   * row with the last attempt number (useful for ops triage).
   */
  public async hedge_mark_hedging(id: string, attempts: number): Promise<void> {
    await prisma.hedge.update({
      where: { id },
      data: { status: "HEDGING", attempts, lastError: null },
    });
  }

  public async hedge_mark_filled(
    id: string,
    polymarket_order_id: string,
    filled_size: number,
    avg_price_cents: number,
  ): Promise<void> {
    await prisma.hedge.update({
      where: { id },
      data: {
        status: "FILLED",
        polymarketOrderId: polymarket_order_id,
        filledSize: filled_size,
        avgPrice: avg_price_cents,
        completedAt: new Date(),
      },
    });
  }

  public async hedge_mark_partial(
    id: string,
    polymarket_order_id: string | null,
    filled_size: number,
    avg_price_cents: number | null,
  ): Promise<void> {
    await prisma.hedge.update({
      where: { id },
      data: {
        status: "PARTIAL",
        polymarketOrderId: polymarket_order_id,
        filledSize: filled_size,
        avgPrice: avg_price_cents,
        completedAt: new Date(),
      },
    });
  }

  public async hedge_mark_failed(id: string, last_error: string): Promise<void> {
    await prisma.hedge.update({
      where: { id },
      data: { status: "FAILED", lastError: last_error, completedAt: new Date() },
    });
  }

  /**
   * Records a transient attempt failure without changing the hedge's
   * terminal status. The worker will retry; this is purely for the
   * audit trail of "what went wrong on the way to a successful fill."
   */
  public async hedge_record_attempt(
    id: string,
    attempts: number,
    last_error: string,
  ): Promise<void> {
    await prisma.hedge.update({
      where: { id },
      data: { attempts, lastError: last_error },
    });
  }

  // ──────────────── Exposure ────────────────

  public async exposure_find(market_id: string): Promise<ExposureRow | null> {
    return prisma.exposure.findUnique({ where: { marketId: market_id } });
  }

  /**
   * Bumps the unhedged USD delta for a market. Used when a fill arrives
   * but before the hedge completes — i.e. the protocol is exposed to
   * the market by `delta_usd` until the hedge fills. The decrement
   * happens once the hedge is FILLED.
   */
  public async exposure_increment(market_id: string, delta_usd: number): Promise<void> {
    await prisma.exposure.upsert({
      where: { marketId: market_id },
      create: {
        marketId: market_id,
        unhedgedUsd: delta_usd,
        lastIncrementAt: new Date(),
      },
      update: {
        unhedgedUsd: { increment: delta_usd },
        lastIncrementAt: new Date(),
      },
    });
  }

  public async exposure_decrement(market_id: string, delta_usd: number): Promise<void> {
    await prisma.exposure.update({
      where: { marketId: market_id },
      data: {
        unhedgedUsd: { decrement: delta_usd },
        lastDecrementAt: new Date(),
      },
    });
  }

  /**
   * Toggles the `paused` flag for a market. Set true by the auto-pause
   * path on permanent hedge failure; set false manually by ops once the
   * underlying issue is resolved.
   */
  public async exposure_set_paused(market_id: string, paused: boolean): Promise<void> {
    await prisma.exposure.upsert({
      where: { marketId: market_id },
      create: { marketId: market_id, paused },
      update: { paused },
    });
  }

  // ──────────────── Internals ────────────────

  private shape_fill(
    row: {
      id: string;
      userId: string;
      marketId: string;
      side: Side;
      outcome: Outcome;
      price: number;
      size: number;
      solanaTxSig: string;
      nonce: string | null;
    } | null,
  ): FillRow | null {
    if (!row || !row.nonce) return null;
    return {
      id: row.id,
      nonce: row.nonce,
      userId: row.userId,
      marketId: row.marketId,
      side: row.side,
      outcome: row.outcome,
      price: row.price,
      size: row.size,
      solanaTxSig: row.solanaTxSig,
    };
  }
}
