import type { Outcome } from "@solmarket/database";

import { ENV } from "../envs/env";
import { logger_for } from "../log/log";
import type PolymarketClient from "../clients/polymarket";
import Market from "../db/market";
import ResolverDb from "../db/resolver";
import Hedge from "../db/hedge";
import type Hedger from "../hedger";

/** A hedge in HEDGING state for longer than this is considered stuck. */
const STUCK_HEDGE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Periodic safety net that catches drift between our DB, Polymarket's
 * gamma, and the hedge worker. Three concerns:
 *
 *   1. **UMA dispute reversal** — if a market we recorded as resolved
 *      flips back to "not closed" or becomes ambiguous on gamma, that
 *      means UMA is mid-dispute. Revert our `ResolverState` so we
 *      don't forward a now-incorrect outcome on Solana.
 *
 *   2. **Outcome flip** — if gamma still says closed but the winning
 *      side flipped, update `winningOutcome` and alert. Rare but
 *      possible during dispute resolution.
 *
 *   3. **Stuck hedges** — hedges sitting in HEDGING for over 5 minutes
 *      are flagged. The worker normally either fills/fails fast; long
 *      HEDGING means a Polymarket call is hanging or BullMQ lost the
 *      job. Currently a log-only signal; ops takes manual action.
 *
 * Constructor takes a `Hedger` reference for symmetry with future
 * "re-enqueue this missed fill" logic. The dependency arrow points one
 * way (Reconciler → Hedger) — Hedger has no idea Reconciler exists.
 */
export default class Reconciler {
    private readonly log = logger_for("reconciler");
    private readonly hedger: Hedger;
    private readonly poly: PolymarketClient;
    private interval_handle: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(hedger: Hedger, poly: PolymarketClient) {
        this.hedger = hedger;
        this.poly = poly;
    }

    public start(): void {
        if (this.interval_handle) return;
        this.interval_handle = setInterval(
            () => void this.tick(),
            ENV.HEDGER_RECONCILE_INTERVAL_MS,
        );
        this.log.info({ intervalMs: ENV.HEDGER_RECONCILE_INTERVAL_MS }, "reconciler started");
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
            await this.detect_uma_dispute_reversal();
            await this.detect_stuck_hedges();
        } catch (err) {
            this.log.error({ err }, "reconcile tick failed");
        } finally {
            this.running = false;
        }
    }

    // ──────────────── UMA dispute reversal / outcome flip ────────────────

    /**
     * Walks every market that's been recorded as POLYMARKET_RESOLVED but
     * not yet submitted to Solana, and re-fetches its gamma resolution.
     * Two cases of interest:
     *   - gamma now reports unclosed / ambiguous → UMA dispute,
     *     revert state to PENDING and alert.
     *   - gamma reports a different winning outcome → store the new
     *     value and alert.
     *
     * Markets already submitted to Solana are *not* checked here — once
     * the on-chain resolve_market is confirmed, the outcome is final
     * regardless of any gamma update.
     */
    private async detect_uma_dispute_reversal(): Promise<void> {
        const candidates = await ResolverDb.list_polymarket_resolved_pending_solana();
        for (const row of candidates) {
            try {
                await this.recheck_one(row.marketId, row.winningOutcome);
            } catch (err) {
                this.log.error({ err, marketId: row.marketId }, "recheck failed");
            }
        }
    }

    private async recheck_one(market_id: string, prior_outcome: Outcome | null): Promise<void> {
        const market = await Market.get_summary_by_id(market_id);
        if (!market) return;

        const resolution = await this.poly.fetch_resolution(market.polyMarketId);
        if (!resolution) return;

        if (!resolution.closed || resolution.winningOutcomeIndex === null) {
            await this.handle_dispute_reversal(market_id, market.polyMarketId);
            return;
        }
        const live_outcome: Outcome = resolution.winningOutcomeIndex === 0 ? "YES" : "NO";
        if (prior_outcome && live_outcome !== prior_outcome) {
            await this.handle_outcome_flip(
                market_id,
                market.polyMarketId,
                prior_outcome,
                live_outcome,
            );
        }
    }

    private async handle_dispute_reversal(
        market_id: string,
        polymarket_market_id: string,
    ): Promise<void> {
        this.log.warn(
            { marketId: market_id, polyMarketId: polymarket_market_id },
            ">>> RECONCILE: market is no longer closed on Polymarket — UMA dispute? reverting state",
        );
        await ResolverDb.revert_to_pending(market_id);
    }

    private async handle_outcome_flip(
        market_id: string,
        polymarket_market_id: string,
        prior: Outcome,
        live: Outcome,
    ): Promise<void> {
        this.log.warn(
            { marketId: market_id, polyMarketId: polymarket_market_id, prior, live },
            ">>> RECONCILE: winning outcome changed since first detection",
        );
        await ResolverDb.update_winning_outcome(market_id, live);
    }

    // ──────────────── Stuck hedges ────────────────

    /**
     * Flags any hedge sitting in HEDGING longer than the threshold. Today
     * this is a log-only signal — manual intervention is expected. Future
     * iterations could reset the row to PENDING and re-enqueue via
     * {@link Hedger.on_fill}; the dedupe keeps that safe.
     */
    private async detect_stuck_hedges(): Promise<void> {
        const cutoff = new Date(Date.now() - STUCK_HEDGE_THRESHOLD_MS);
        const stuck = await Hedge.list_stuck(cutoff);
        for (const row of stuck) {
            this.log.warn(
                {
                    hedgeId: row.id,
                    fillId: row.fillId,
                    attempts: row.attempts,
                    stuckSinceMs: Date.now() - row.updatedAt.getTime(),
                },
                "hedge stuck in HEDGING > 5min",
            );
        }
    }
}
