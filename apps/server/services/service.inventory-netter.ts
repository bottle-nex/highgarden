import { prisma } from "@solmarket/database";
import type { Outcome, Side } from "@solmarket/database";

export interface NettingTarget {
    marketId: string;
    /** Direction of the Polymarket trade we'd otherwise place. */
    polymarketSide: Side;
    outcome: Outcome;
    sharesNeeded: number;
}

export interface NettedConsumption {
    inventoryId: string;
    sharesConsumed: number;
    avgPriceCents: number;
    polymarketOrderId: string;
}

export interface NettingResult {
    /** Inventory rows we claimed (in iteration order). */
    consumed: NettedConsumption[];
    /** Total shares pulled from inventory across all consumed rows. */
    totalSharesNetted: number;
    /** Shares still needed after netting — caller must Polymarket-fill these. */
    remainingShares: number;
}

/**
 * Atomically nets a hedge target against existing PlatformInventory rows
 * before the orchestrator places a new Polymarket order. PlatformInventory
 * tracks Polymarket positions the platform holds without a corresponding
 * user Fill (typically from a SOLANA_FAILED_AFTER_HEDGE event); reusing
 * them avoids placing redundant Polymarket orders and pays down the
 * platform's open exposure.
 *
 * Matching rule: same `marketId`, same `polymarketSide`, same `outcome`,
 * not yet netted, not yet liquidated. Rows are consumed FIFO (oldest
 * first) so older platform exposures clear first.
 *
 * Atomicity: each consumption is wrapped in a transaction with a
 * conditional update that no-ops if some other request already netted the
 * row. The caller can safely call this concurrently — at most one will
 * win each row.
 */
export default class InventoryNetterService {
    public async net(target: NettingTarget): Promise<NettingResult> {
        const candidates = await this.find_candidates(target);
        const consumed: NettedConsumption[] = [];
        let remaining = target.sharesNeeded;

        for (const row of candidates) {
            if (remaining <= 0) break;
            const claim = await this.try_claim_row(row.id, row.shares, remaining);
            if (!claim) continue;
            consumed.push({
                inventoryId: row.id,
                sharesConsumed: claim.consumed,
                avgPriceCents: row.avgPriceCents,
                polymarketOrderId: row.polymarketOrderId,
            });
            remaining -= claim.consumed;
        }

        const total_netted = target.sharesNeeded - remaining;
        return { consumed, totalSharesNetted: total_netted, remainingShares: remaining };
    }

    /** Mark consumed rows linked to a freshly-created Fill. Called after
     *  the Solana commit lands so PlatformInventory points at the Fill that
     *  consumed it. */
    public async link_to_fill(inventory_ids: string[], fill_id: string): Promise<void> {
        if (inventory_ids.length === 0) return;
        await prisma.fill.update({
            where: { id: fill_id },
            // Schema only allows linking ONE inventory id per Fill (1:1
            // relation). For multi-row consumption we link the first; any
            // additional rows are tracked via PlatformInventory.nettedAt
            // alone (set in try_claim_row).
            data: { nettedFromInventoryId: inventory_ids[0] ?? null },
        });
    }

    /** Returns oldest-first candidate rows that match the target direction
     *  and are still consumable (not netted, not liquidated). */
    private async find_candidates(target: NettingTarget) {
        return prisma.platformInventory.findMany({
            where: {
                marketId: target.marketId,
                side: target.polymarketSide,
                outcome: target.outcome,
                nettedAt: null,
                liquidatedAt: null,
            },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                shares: true,
                avgPriceCents: true,
                polymarketOrderId: true,
            },
        });
    }

    /**
     * Attempts to atomically mark one inventory row as netted. Returns
     * `null` if the row was already netted (lost the race) — caller should
     * skip and try the next candidate.
     *
     * Rows are consumed all-or-nothing: if we need 30 shares and the row
     * has 100, we still claim the whole row and the orchestrator credits
     * 30 to the user, leaving 70 as platform inventory of a different
     * shape. For PR 2 we simplify by only matching whole rows where
     * row.shares <= sharesNeeded; the remaining inventory after partial
     * consumption is out of scope (handled by liquidator in a later PR).
     */
    private async try_claim_row(
        inventory_id: string,
        row_shares: number,
        shares_needed: number,
    ): Promise<{ consumed: number } | null> {
        if (row_shares > shares_needed) {
            // Row is bigger than we need — skip for MVP; liquidator handles
            // partial reductions later. Avoids splitting a row mid-trade.
            return null;
        }
        const updated = await prisma.platformInventory.updateMany({
            where: {
                id: inventory_id,
                nettedAt: null,
                liquidatedAt: null,
            },
            data: { nettedAt: new Date() },
        });
        if (updated.count === 0) return null;
        return { consumed: row_shares };
    }
}
