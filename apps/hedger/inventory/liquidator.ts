import { prisma } from "@solmarket/database";
import type { PolymarketClient } from "@solmarket/polymarket-client";
import { ENV } from "../envs/env";
import { logger_for } from "../log/log";

/**
 * Periodically liquidates stale `PlatformInventory` rows by placing the
 * opposite-direction Polymarket order to unwind the platform's accidental
 * exposure. Rows older than `HEDGER_INVENTORY_LIQUIDATE_AFTER_HOURS` are
 * candidates; everything younger is left alone so the hedge-first
 * orchestrator's netter has a chance to consume them via real user trades
 * (which captures the spread instead of paying it).
 *
 * Single-flight per tick — if a previous liquidation pass is still running
 * when the timer fires, the next tick is skipped rather than running in
 * parallel.
 *
 * Per-tick cap: at most `HEDGER_INVENTORY_LIQUIDATE_MAX_SHARES_PER_TICK`
 * shares unwound across all rows. This keeps one massive orphan from
 * monopolising the rate-limited Polymarket connection and starving fresh
 * trades.
 */
export default class PlatformInventoryLiquidator {
    private readonly log = logger_for("inventory");
    private readonly poly: PolymarketClient;
    private interval_handle: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(poly: PolymarketClient) {
        this.poly = poly;
    }

    public start(): void {
        if (this.interval_handle) return;
        this.interval_handle = setInterval(
            () => void this.tick(),
            ENV.HEDGER_INVENTORY_LIQUIDATE_INTERVAL_MS,
        );
        this.log.info(
            {
                interval_ms: ENV.HEDGER_INVENTORY_LIQUIDATE_INTERVAL_MS,
                stale_after_hours: ENV.HEDGER_INVENTORY_LIQUIDATE_AFTER_HOURS,
            },
            "liquidator started",
        );
    }

    public stop(): void {
        if (this.interval_handle) {
            clearInterval(this.interval_handle);
            this.interval_handle = null;
        }
    }

    private async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.run_once();
        } catch (err) {
            this.log.error({ err }, "liquidator tick failed");
        } finally {
            this.running = false;
        }
    }

    private async run_once(): Promise<void> {
        const candidates = await this.list_stale_orphans();
        if (candidates.length === 0) return;

        let shares_remaining = ENV.HEDGER_INVENTORY_LIQUIDATE_MAX_SHARES_PER_TICK;
        for (const row of candidates) {
            if (shares_remaining <= 0) break;
            if (row.shares > shares_remaining) {
                this.log.info(
                    { rowId: row.id, shares: row.shares, budget: shares_remaining },
                    "skipping row larger than per-tick cap; will retry next tick",
                );
                continue;
            }
            const consumed = await this.liquidate_one_safely(row);
            if (consumed > 0) shares_remaining -= consumed;
        }
    }

    private async list_stale_orphans() {
        const cutoff = new Date(
            Date.now() - ENV.HEDGER_INVENTORY_LIQUIDATE_AFTER_HOURS * 3_600_000,
        );
        return prisma.platformInventory.findMany({
            where: {
                nettedAt: null,
                liquidatedAt: null,
                createdAt: { lt: cutoff },
            },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                marketId: true,
                polymarketTokenId: true,
                side: true,
                outcome: true,
                shares: true,
                avgPriceCents: true,
            },
        });
    }

    private async liquidate_one_safely(row: {
        id: string;
        marketId: string;
        polymarketTokenId: string;
        side: "BUY" | "SELL";
        shares: number;
    }): Promise<number> {
        try {
            return await this.liquidate_one(row);
        } catch (err) {
            this.log.error({ err, row_id: row.id }, "liquidation attempt failed");
            await this.append_note(row.id, `liquidation_failed: ${(err as Error)?.message ?? "?"}`);
            return 0;
        }
    }

    private async liquidate_one(row: {
        id: string;
        marketId: string;
        polymarketTokenId: string;
        side: "BUY" | "SELL";
        shares: number;
    }): Promise<number> {
        const claimed = await this.try_claim(row.id);
        if (!claimed) return 0;

        // Reverse the platform's position: if we held a BUY (long),
        // place a SELL to close. The CLOB price target is best-of-book
        // for the OPPOSITE side from what we'd normally chase.
        const reverse_side = row.side === "BUY" ? "SELL" : "BUY";
        const top = await this.poly.get_top_of_book(row.polymarketTokenId);
        const target_cents = reverse_side === "BUY" ? top.bestAskCents : top.bestBidCents;
        if (target_cents === null) {
            await this.unclaim(row.id);
            await this.append_note(row.id, "skipped: no top-of-book");
            return 0;
        }

        const tick_size = await this.lookup_tick_size(row.marketId);
        const result = await this.poly.place_market_order({
            tokenId: row.polymarketTokenId,
            side: reverse_side,
            sizeShares: row.shares,
            priceCents: target_cents,
            tickSize: tick_size.tickSize,
            negRisk: tick_size.negRisk,
            clientOrderId: `liq-${row.id}`,
        });

        await this.record_liquidation(row.id, result.polymarketOrderId);
        this.log.warn(
            {
                row_id: row.id,
                shares: row.shares,
                reverse_side,
                target_cents,
                filled_shares: result.filledShares,
                liquidate_order_id: result.polymarketOrderId,
            },
            ">>> LIQUIDATED stale platform inventory",
        );
        return result.filledShares;
    }

    /** Atomic claim — flips `liquidatedAt` to now ONLY if not already
     *  netted/liquidated. Returns false if some other tick beat us. */
    private async try_claim(row_id: string): Promise<boolean> {
        const updated = await prisma.platformInventory.updateMany({
            where: { id: row_id, nettedAt: null, liquidatedAt: null },
            data: { liquidatedAt: new Date() },
        });
        return updated.count > 0;
    }

    private async unclaim(row_id: string): Promise<void> {
        await prisma.platformInventory.update({
            where: { id: row_id },
            data: { liquidatedAt: null },
        });
    }

    private async record_liquidation(row_id: string, order_id: string | null): Promise<void> {
        await prisma.platformInventory.update({
            where: { id: row_id },
            data: { liquidateOrderId: order_id },
        });
    }

    private async append_note(row_id: string, note: string): Promise<void> {
        try {
            await prisma.platformInventory.update({
                where: { id: row_id },
                data: { notes: note.slice(0, 500) },
            });
        } catch {
            /* note write is best-effort — never let it mask the real error */
        }
    }

    private async lookup_tick_size(market_id: string) {
        const row = await prisma.market.findUnique({
            where: { id: market_id },
            select: { polymarket: { select: { tickSize: true, negRisk: true } } },
        });
        return {
            tickSize: row?.polymarket?.tickSize ?? "0.01",
            negRisk: row?.polymarket?.negRisk ?? false,
        };
    }
}
