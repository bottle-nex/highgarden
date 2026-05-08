import { prisma } from "@solmarket/database";

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
 * Slim projection used by the resolver loop's pre-filter — no Polymarket
 * join, just the fields needed to decide whether the market should be
 * fed into the next stage.
 */
export interface MarketWithPda {
    id: string;
    name: string;
    polyMarketId: string;
    solanaMarketPda: string;
}

export interface MarketSummary {
    id: string;
    name: string;
    polyMarketId: string;
    solanaMarketPda: string | null;
}

export default class Market {
    /**
     * Looks up a market by the on-chain Solana PDA. Used by the hedge
     * processor to translate an `OrderFilled` event's `market` field
     * (which is a PDA) into the corresponding DB market row plus its
     * Polymarket token ids.
     */
    static async find_by_pda(pda: string): Promise<MarketMetadata | null> {
        const row = await prisma.market.findFirst({
            where: { solanaMarketPda: pda },
            include: { polymarket: true },
        });
        return row ? Market.shape(row) : null;
    }

    /**
     * Reverse lookup by Polymarket conditionId. Used by the resolver loop
     * when it finds a settled Polymarket market and needs to find the
     * corresponding Solana market to forward the outcome to.
     */
    static async find_by_polymarket_id(polymarket_id: string): Promise<MarketMetadata | null> {
        const row = await prisma.market.findFirst({
            where: { polyMarketId: polymarket_id },
            include: { polymarket: true },
        });
        return row ? Market.shape(row) : null;
    }

    /**
     * Lists every market the hedger should consider (those with a Solana
     * PDA — markets that have been deployed on-chain). Used by the
     * resolver and reconciler loops as the starting set per tick.
     */
    static async list_active(): Promise<MarketMetadata[]> {
        const rows = await prisma.market.findMany({
            where: { solanaMarketPda: { not: null } },
            include: { polymarket: true },
        });
        return rows.map((row) => Market.shape(row));
    }

    /**
     * Slim list of markets with a deployed PDA, used by the resolver's
     * stage-1 candidate sweep. Skips the polymarket join (the resolver
     * doesn't need token ids until later) and returns only the fields the
     * loop's pre-filter consults.
     */
    static async list_with_pda(): Promise<MarketWithPda[]> {
        const rows = await prisma.market.findMany({
            where: { solanaMarketPda: { not: null } },
            select: { id: true, name: true, polyMarketId: true, solanaMarketPda: true },
        });
        const out: MarketWithPda[] = [];
        for (const row of rows) {
            if (!row.solanaMarketPda) continue;
            out.push({
                id: row.id,
                name: row.name,
                polyMarketId: row.polyMarketId,
                solanaMarketPda: row.solanaMarketPda,
            });
        }
        return out;
    }

    /**
     * Tiny projection — id/name/polyMarketId/solanaMarketPda keyed by
     * market id. Used by the reconciler and resolver where they have an
     * id and need a small subset of fields without paying for the full
     * polymarket join.
     */
    static async get_summary_by_id(market_id: string): Promise<MarketSummary | null> {
        return prisma.market.findUnique({
            where: { id: market_id },
            select: { id: true, name: true, polyMarketId: true, solanaMarketPda: true },
        });
    }

    private static shape(row: {
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
