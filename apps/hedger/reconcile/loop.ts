import { prisma } from "@solmarket/database";
import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";
import EventRepo from "../db/event.repo";
import HedgerGammaClient from "../polymarket/gamma";

const STUCK_HEDGE_THRESHOLD_MS = 5 * 60 * 1000;

export default class ReconcileLoop {
    private readonly log = LoggerFactory.for_category("reconcile");
    private readonly events = new EventRepo();
    private readonly gamma = new HedgerGammaClient();
    private interval_handle: ReturnType<typeof setInterval> | null = null;
    private running = false;

    public start(): void {
        if (this.interval_handle) return;
        this.interval_handle = setInterval(
            () => void this.tick(),
            ENV.HEDGER_RECONCILE_INTERVAL_MS,
        );
        this.log.info({ intervalMs: ENV.HEDGER_RECONCILE_INTERVAL_MS }, "reconcile loop started");
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

    private async detect_uma_dispute_reversal(): Promise<void> {
        const candidates = await prisma.resolverState.findMany({
            where: { stage: "POLYMARKET_RESOLVED", solanaResolveTxSig: null },
        });
        for (const row of candidates) {
            await this.recheck_one(row.marketId, row.winningOutcome);
        }
    }

    private async recheck_one(market_id: string, prior_outcome: string | null): Promise<void> {
        const market = await prisma.market.findUnique({
            where: { id: market_id },
            select: { polyMarketId: true },
        });
        if (!market) return;

        const resolution = await this.gamma.fetch_resolution(market.polyMarketId);
        if (!resolution) return;

        if (!resolution.closed || resolution.winningOutcomeIndex === null) {
            await this.handle_dispute_reversal(market_id, market.polyMarketId);
            return;
        }
        const live_outcome = resolution.winningOutcomeIndex === 0 ? "YES" : "NO";
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
        await prisma.resolverState.update({
            where: { marketId: market_id },
            data: { stage: "PENDING", polymarketResolvedAt: null, winningOutcome: null },
        });
        await this.events.record_alert("reconcile", "polymarket resolution reverted", {
            marketId: market_id,
            polyMarketId: polymarket_market_id,
        });
    }

    private async handle_outcome_flip(
        market_id: string,
        polymarket_market_id: string,
        prior: string,
        live: string,
    ): Promise<void> {
        this.log.warn(
            { marketId: market_id, polyMarketId: polymarket_market_id, prior, live },
            ">>> RECONCILE: winning outcome changed since first detection",
        );
        await prisma.resolverState.update({
            where: { marketId: market_id },
            data: { winningOutcome: live === "YES" ? "YES" : "NO" },
        });
        await this.events.record_alert("reconcile", "winning outcome flipped", {
            marketId: market_id,
            polyMarketId: polymarket_market_id,
            prior,
            live,
        });
    }

    private async detect_stuck_hedges(): Promise<void> {
        const cutoff = new Date(Date.now() - STUCK_HEDGE_THRESHOLD_MS);
        const stuck = await prisma.hedge.findMany({
            where: { status: "HEDGING", updatedAt: { lt: cutoff } },
            select: { id: true, fillId: true, attempts: true, updatedAt: true },
        });
        for (const row of stuck) {
            await this.alert_stuck_hedge(row);
        }
    }

    private async alert_stuck_hedge(row: {
        id: string;
        fillId: string;
        attempts: number;
        updatedAt: Date;
    }): Promise<void> {
        this.log.warn({ hedgeId: row.id, fillId: row.fillId }, "hedge stuck in HEDGING > 5min");
        await this.events.record_alert("reconcile", "hedge stuck in HEDGING state", {
            hedgeId: row.id,
            fillId: row.fillId,
            attempts: row.attempts,
            stuckSinceMs: Date.now() - row.updatedAt.getTime(),
        });
    }
}
