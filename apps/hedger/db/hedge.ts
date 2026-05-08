import { prisma } from "@solmarket/database";
import type { HedgeStatus, Side } from "@solmarket/database";

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

/**
 * Slim projection used by the reconciler's stuck-hedge sweep.
 */
export interface StuckHedgeRow {
    id: string;
    fillId: string;
    attempts: number;
    updatedAt: Date;
}

/**
 * Pause-context lookup result: walks `BullJob → Hedge → Fill → Market`
 * to give the auto-pause path the on-chain market PDA it needs.
 */
export interface PauseContext {
    marketId: string;
    solanaMarketPda: string;
}

export default class Hedge {
    static async find_by_fill_id(fill_id: string): Promise<HedgeRow | null> {
        return prisma.hedge.findUnique({ where: { fillId: fill_id } });
    }

    static async find_by_bull_job_id(job_id: string): Promise<HedgeRow | null> {
        return prisma.hedge.findUnique({ where: { bullJobId: job_id } });
    }

    /**
     * Returns hedges left in IN_PROGRESS-ish states from a previous boot.
     * Used by `Hedger.recover_in_flight` at startup to either re-enqueue
     * or terminate them. Includes PENDING (never started) and HEDGING (in
     * the middle of an attempt that crashed).
     */
    static async find_in_progress(): Promise<HedgeRow[]> {
        return prisma.hedge.findMany({
            where: { status: { in: ["PENDING", "HEDGING"] } },
        });
    }

    /**
     * Inserts a hedge if absent, otherwise returns the existing row. Same
     * P2002 race handling as `Fill.insert_idempotent`. The returned
     * `created` flag is rarely consulted — most callers use this purely
     * as "give me the hedge for this fill, creating one if needed."
     */
    static async create_idempotent(
        params: CreateHedgeParams,
    ): Promise<{ row: HedgeRow; created: boolean }> {
        const existing = await Hedge.find_by_fill_id(params.fillId);
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
                const row = await Hedge.find_by_fill_id(params.fillId);
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
    static async mark_hedging(id: string, attempts: number): Promise<void> {
        await prisma.hedge.update({
            where: { id },
            data: { status: "HEDGING", attempts, lastError: null },
        });
    }

    static async mark_filled(
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

    static async mark_partial(
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

    static async mark_failed(id: string, last_error: string): Promise<void> {
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
    static async record_attempt(id: string, attempts: number, last_error: string): Promise<void> {
        await prisma.hedge.update({
            where: { id },
            data: { attempts, lastError: last_error },
        });
    }

    /**
     * Walks the failed job back to the on-chain market PDA via
     * `BullJob → Hedge → Fill → Market`. Returns null when any link is
     * broken; the caller logs and moves on (auto-pause is best-effort).
     */
    static async find_pause_context_by_job_id(job_id: string): Promise<PauseContext | null> {
        const hedge = await prisma.hedge.findUnique({
            where: { bullJobId: job_id },
            include: { fill: { include: { market: true } } },
        });
        const market = hedge?.fill?.market;
        if (!market?.solanaMarketPda) return null;
        return { marketId: market.id, solanaMarketPda: market.solanaMarketPda };
    }

    /**
     * Returns hedges sitting in HEDGING longer than the given cutoff.
     * Used by the reconciler's stuck-hedge sweep — currently a log-only
     * signal, intended for ops triage.
     */
    static async list_stuck(cutoff: Date): Promise<StuckHedgeRow[]> {
        return prisma.hedge.findMany({
            where: { status: "HEDGING", updatedAt: { lt: cutoff } },
            select: { id: true, fillId: true, attempts: true, updatedAt: true },
        });
    }

    /**
     * Boot-recovery helper: returns every hedge stuck in HEDGING. Distinct
     * from {@link Hedge.list_stuck} because there's no time cutoff —
     * anything in HEDGING at boot is by definition from a prior crash.
     */
    static async list_all_in_hedging(): Promise<
        { id: string; fillId: string; clientOrderId: string | null; attempts: number }[]
    > {
        return prisma.hedge.findMany({
            where: { status: "HEDGING" },
            select: { id: true, fillId: true, clientOrderId: true, attempts: true },
        });
    }

    /** Boot-recovery helper: resets a single hedge row to PENDING. */
    static async reset_to_pending(id: string): Promise<void> {
        await prisma.hedge.update({ where: { id }, data: { status: "PENDING" } });
    }
}
