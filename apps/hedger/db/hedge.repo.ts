import { prisma } from "@solmarket/database";
import type { HedgeStatus, Side } from "@solmarket/database";

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

export default class HedgeRepo {
    public async find_by_fill_id(fill_id: string): Promise<HedgeRow | null> {
        return prisma.hedge.findUnique({ where: { fillId: fill_id } });
    }

    public async find_by_bull_job_id(job_id: string): Promise<HedgeRow | null> {
        return prisma.hedge.findUnique({ where: { bullJobId: job_id } });
    }

    public async create_idempotent(
        params: CreateHedgeParams,
    ): Promise<{ row: HedgeRow; created: boolean }> {
        const existing = await this.find_by_fill_id(params.fillId);
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
                const row = await this.find_by_fill_id(params.fillId);
                if (row) return { row, created: false };
            }
            throw err;
        }
    }

    public async mark_hedging(id: string, attempts: number): Promise<void> {
        await prisma.hedge.update({
            where: { id },
            data: { status: "HEDGING", attempts, lastError: null },
        });
    }

    public async mark_filled(
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

    public async mark_partial(
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

    public async mark_failed(id: string, last_error: string): Promise<void> {
        await prisma.hedge.update({
            where: { id },
            data: { status: "FAILED", lastError: last_error, completedAt: new Date() },
        });
    }

    public async record_attempt(id: string, attempts: number, last_error: string): Promise<void> {
        await prisma.hedge.update({
            where: { id },
            data: { attempts, lastError: last_error },
        });
    }
}
