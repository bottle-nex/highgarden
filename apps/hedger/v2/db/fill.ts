import { prisma } from "@solmarket/database";
import type { Side, Outcome } from "@solmarket/database";

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

export default class Fill {
    /**
     * Looks up a fill by its on-chain nonce (hex). The nonce is unique
     * per fill (the on-chain program enforces this), so this is the
     * dedupe primitive both the queue (job id) and the DB (this lookup)
     * lean on.
     */
    static async find_by_nonce(nonce_hex: string): Promise<FillRow | null> {
        const row = await prisma.fill.findUnique({ where: { nonce: nonce_hex } });
        return Fill.shape(row);
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
    static async insert_idempotent(
        params: InsertFillParams,
    ): Promise<{ row: FillRow; created: boolean }> {
        const existing = await Fill.find_by_nonce(params.nonceHex);
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
            const shaped = Fill.shape(created);
            if (!shaped) throw new Error("fill_insert: shape returned null after create");
            return { row: shaped, created: true };
        } catch (err) {
            if ((err as { code?: string }).code === "P2002") {
                const row = await Fill.find_by_nonce(params.nonceHex);
                if (row) return { row, created: false };
            }
            throw err;
        }
    }

    /**
     * Boot-recovery helper: returns every fill with its hedge status.
     * Used by the exposure drift check to recompute "what should be
     * unhedged" from authoritative tables.
     */
    static async list_with_hedge_status(): Promise<
        {
            marketId: string;
            side: Side;
            price: number;
            size: number;
            hedge: { status: string } | null;
        }[]
    > {
        const rows = await prisma.fill.findMany({
            select: {
                marketId: true,
                side: true,
                price: true,
                size: true,
                hedge: { select: { status: true } },
            },
        });
        return rows.map((r) => ({
            marketId: r.marketId,
            side: r.side,
            price: r.price,
            size: r.size,
            hedge: r.hedge ? { status: r.hedge.status } : null,
        }));
    }

    private static shape(
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
