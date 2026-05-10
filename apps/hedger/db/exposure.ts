import { prisma } from "@solmarket/database";

export interface ExposureRow {
    marketId: string;
    unhedgedUsd: number;
    trackerEnabled: boolean;
    paused: boolean;
}

export default class Exposure {
    static async find(market_id: string): Promise<ExposureRow | null> {
        return prisma.exposure.findUnique({ where: { marketId: market_id } });
    }

    /**
     * Bumps the unhedged USD delta for a market. Used when a fill arrives
     * but before the hedge completes — i.e. the protocol is exposed to
     * the market by `delta_usd` until the hedge fills. The decrement
     * happens once the hedge is FILLED.
     */
    static async increment(market_id: string, delta_usd: number): Promise<void> {
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

    static async decrement(market_id: string, delta_usd: number): Promise<void> {
        await prisma.exposure.update({
            where: { marketId: market_id },
            data: {
                unhedgedUsd: { decrement: delta_usd },
                lastDecrementAt: new Date(),
            },
        });
    }

    /**
     * Applies a signed delta to unhedgedUsd. Convention:
     *   - positive = BUY-direction work pending (we owe shares)
     *   - negative = SELL-direction work pending (we have excess shares)
     * The cap is enforced as a two-sided bound on |unhedgedUsd|.
     */
    static async apply_signed_delta(market_id: string, signed_delta_usd: number): Promise<void> {
        const now = new Date();
        const stamps = signed_delta_usd >= 0 ? { lastIncrementAt: now } : { lastDecrementAt: now };
        await prisma.exposure.upsert({
            where: { marketId: market_id },
            create: {
                marketId: market_id,
                unhedgedUsd: signed_delta_usd,
                ...stamps,
            },
            update: {
                unhedgedUsd: { increment: signed_delta_usd },
                ...stamps,
            },
        });
    }

    /**
     * Toggles the `paused` flag for a market. Set true by the auto-pause
     * path on permanent hedge failure; set false manually by ops once the
     * underlying issue is resolved.
     */
    static async set_paused(market_id: string, paused: boolean): Promise<void> {
        await prisma.exposure.upsert({
            where: { marketId: market_id },
            create: { marketId: market_id, paused },
            update: { paused },
        });
    }

    /**
     * Returns every Exposure row. Boot-recovery helper used to reconcile
     * cached `unhedgedUsd` against a recomputed-from-fills value.
     */
    static async list_all(): Promise<{ marketId: string; unhedgedUsd: number }[]> {
        return prisma.exposure.findMany({ select: { marketId: true, unhedgedUsd: true } });
    }

    /**
     * Hard-overwrites `unhedgedUsd`. Boot-recovery helper used when the
     * drift check finds the cached value disagrees with the recomputed
     * total by more than $1.
     */
    static async set_unhedged_usd(market_id: string, value: number): Promise<void> {
        await prisma.exposure.update({
            where: { marketId: market_id },
            data: { unhedgedUsd: value, lastDecrementAt: new Date() },
        });
    }
}
