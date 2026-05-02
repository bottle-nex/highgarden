import { prisma } from "@solmarket/database";

export interface MarketMetadata {
    id: string;
    polyMarketId: string;
    yesTokenId: string;
    noTokenId: string;
    tickSize: string;
    negRisk: boolean;
    solanaMarketPda: string | null;
}

export default class MarketRepo {
    public async find_by_solana_pda(pda: string): Promise<MarketMetadata | null> {
        const row = await prisma.market.findFirst({
            where: { solanaMarketPda: pda },
            include: { polymarket: true },
        });
        if (!row) return null;
        return this.shape(row);
    }

    public async find_by_polymarket_id(
        polymarket_id: string,
    ): Promise<MarketMetadata | null> {
        const row = await prisma.market.findFirst({
            where: { polyMarketId: polymarket_id },
            include: { polymarket: true },
        });
        if (!row) return null;
        return this.shape(row);
    }

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
