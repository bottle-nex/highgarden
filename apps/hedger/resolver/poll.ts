import { prisma } from "@solmarket/database";
import type { Outcome } from "@solmarket/database";
import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";
import EventRepo from "../db/event.repo";
import HedgerGammaClient, { type GammaResolution } from "../polymarket/gamma";
import ResolverStateRepo, { type ResolverStateRow } from "../db/resolver-state.repo";

interface MarketCandidate {
    marketId: string;
    polyMarketId: string;
    name: string;
    solanaMarketPda: string;
}

export default class ResolverPoller {
    private readonly log = LoggerFactory.for_category("resolver");
    private readonly gamma = new HedgerGammaClient();
    private readonly state = new ResolverStateRepo();
    private readonly events = new EventRepo();
    private interval_handle: ReturnType<typeof setInterval> | null = null;
    private running = false;

    public start(): void {
        if (this.interval_handle) return;
        void this.tick();
        this.interval_handle = setInterval(
            () => void this.tick(),
            ENV.HEDGER_RESOLVER_POLL_INTERVAL_MS,
        );
        this.log.info(
            { intervalMs: ENV.HEDGER_RESOLVER_POLL_INTERVAL_MS },
            "resolver poller started",
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
            const candidates = await this.list_pending_candidates();
            for (const candidate of candidates) {
                await this.check_one_safely(candidate);
            }
        } catch (err) {
            this.log.error({ err }, "resolver tick failed");
        } finally {
            this.running = false;
        }
    }

    private async list_pending_candidates(): Promise<MarketCandidate[]> {
        const rows = await prisma.market.findMany({
            where: {
                solanaMarketPda: { not: null },
                listing: { status: "APPROVED" },
                OR: [
                    { exposure: null }, // listed but no resolver state row yet
                    {},
                ],
            },
            select: {
                id: true,
                name: true,
                polyMarketId: true,
                solanaMarketPda: true,
            },
        });
        const filtered: MarketCandidate[] = [];
        for (const row of rows) {
            if (!row.solanaMarketPda) continue;
            const state = await this.state.find(row.id);
            if (this.is_terminal(state?.stage)) continue;
            filtered.push({
                marketId: row.id,
                polyMarketId: row.polyMarketId,
                name: row.name,
                solanaMarketPda: row.solanaMarketPda,
            });
        }
        return filtered;
    }

    private is_terminal(stage: string | undefined): boolean {
        return (
            stage === "POLYMARKET_RESOLVED" ||
            stage === "SOLANA_RESOLVED" ||
            stage === "REDEEMED"
        );
    }

    private async check_one_safely(candidate: MarketCandidate): Promise<void> {
        try {
            await this.check_one(candidate);
        } catch (err) {
            this.log.error({ err, marketId: candidate.marketId }, "resolver check failed");
        }
    }

    private async check_one(candidate: MarketCandidate): Promise<void> {
        const resolution = await this.gamma.fetch_resolution(candidate.polyMarketId);
        if (!resolution) return;
        if (!resolution.closed) return;
        if (resolution.winningOutcomeIndex === null) {
            this.log.debug(
                { marketId: candidate.marketId, polyMarketId: candidate.polyMarketId },
                "market closed but winner not yet determinable",
            );
            return;
        }
        await this.record_resolution(candidate, resolution);
    }

    private async record_resolution(
        candidate: MarketCandidate,
        resolution: GammaResolution,
    ): Promise<void> {
        const winning_outcome: Outcome =
            resolution.winningOutcomeIndex === 0 ? "YES" : "NO";
        const resolved_at = resolution.resolvedAt ?? new Date();

        const existing = await this.state.find(candidate.marketId);
        if (existing?.polymarketResolvedAt) {
            return; // already recorded
        }

        const row: ResolverStateRow = await this.state.record_polymarket_resolved(
            candidate.marketId,
            winning_outcome,
            resolved_at,
        );

        this.log.info(
            {
                marketId: candidate.marketId,
                polyMarketId: candidate.polyMarketId,
                name: candidate.name,
                winningOutcome: winning_outcome,
                resolvedAt: row.polymarketResolvedAt?.toISOString() ?? null,
            },
            ">>> RESOLVER: polymarket resolution detected",
        );

        await this.events.record({
            level: "INFO",
            category: "resolver",
            message: "polymarket resolution detected",
            payload: {
                marketId: candidate.marketId,
                polyMarketId: candidate.polyMarketId,
                winningOutcome: winning_outcome,
                resolvedAt: resolved_at.toISOString(),
            },
        });
    }
}
