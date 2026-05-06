import { prisma } from "@solmarket/database";
import type { Outcome } from "@solmarket/database";
import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";
import EventRepo from "../db/event.repo";
import HedgerGammaClient, { type GammaResolution } from "../polymarket/gamma";
import ResolverStateRepo, { type ResolverStateRow } from "../db/resolver-state.repo";
import SolanaResolutionSubmitter from "./submit-solana";
import PolymarketRedeemer, { type RedeemOutcome } from "../polymarket/redeem";

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
    private readonly submitter = new SolanaResolutionSubmitter();
    private readonly redeemer = new PolymarketRedeemer();
    private interval_handle: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private warned_unconfigured = false;
    private warned_redeemer_unconfigured = false;

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
            await this.poll_gamma_for_pending();
            await this.submit_solana_for_resolved();
            await this.redeem_polygon_for_resolved();
        } catch (err) {
            this.log.error({ err }, "resolver tick failed");
        } finally {
            this.running = false;
        }
    }

    private async redeem_polygon_for_resolved(): Promise<void> {
        if (!this.redeemer.is_configured()) {
            if (!this.warned_redeemer_unconfigured) {
                this.log.warn(
                    "polygon redeem disabled — set HEDGER_POLYGON_RPC_URL + HEDGER_POLYMARKET_PRIVATE_KEY to enable",
                );
                this.warned_redeemer_unconfigured = true;
            }
            return;
        }
        const ready = await this.state.list_awaiting_redemption();
        for (const row of ready) {
            await this.redeem_one_safely(row);
        }
    }

    private async redeem_one_safely(row: ResolverStateRow): Promise<void> {
        try {
            await this.redeem_one(row);
        } catch (err) {
            this.log.error({ err, marketId: row.marketId }, "polygon redeem failed");
            await this.events.record_alert("resolver", "polymarket redemption failed", {
                marketId: row.marketId,
                error: (err as Error)?.message ?? String(err),
            });
        }
    }

    private async redeem_one(row: ResolverStateRow): Promise<void> {
        const market = await prisma.market.findUnique({
            where: { id: row.marketId },
            select: { polyMarketId: true, name: true },
        });
        if (!market) return;

        const outcome = await this.redeemer.redeem({ polymarketMarketId: market.polyMarketId });
        await this.handle_redeem_outcome(row.marketId, market.polyMarketId, market.name, outcome);
    }

    private async handle_redeem_outcome(
        market_id: string,
        polymarket_market_id: string,
        name: string,
        outcome: RedeemOutcome,
    ): Promise<void> {
        if (outcome.kind === "submitted") {
            await this.state.record_redeemed(market_id, outcome.txHash, new Date());
            this.log.info(
                {
                    marketId: market_id,
                    polyMarketId: polymarket_market_id,
                    name,
                    txHash: outcome.txHash,
                },
                ">>> RESOLVER: polygon redemption confirmed",
            );
            await this.events.record({
                level: "INFO",
                category: "resolver",
                message: "polygon redemption confirmed",
                payload: {
                    marketId: market_id,
                    polyMarketId: polymarket_market_id,
                    txHash: outcome.txHash,
                },
            });
            return;
        }
        if (outcome.kind === "skipped_neg_risk" || outcome.kind === "skipped_no_condition_id") {
            await this.state.mark_redeem_skipped(market_id, outcome.kind);
            await this.events.record_alert(
                "resolver",
                "redemption skipped — manual action required",
                {
                    marketId: market_id,
                    polyMarketId: polymarket_market_id,
                    reason: outcome.kind,
                },
            );
            return;
        }
        // skipped_not_resolved → silent retry next tick
    }

    private async poll_gamma_for_pending(): Promise<void> {
        const candidates = await this.list_pending_candidates();
        for (const candidate of candidates) {
            await this.check_one_safely(candidate);
        }
    }

    private async submit_solana_for_resolved(): Promise<void> {
        if (!this.submitter.is_configured()) {
            if (!this.warned_unconfigured) {
                this.log.warn(
                    "HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR is not set — skipping Solana resolution submission",
                );
                this.warned_unconfigured = true;
            }
            return;
        }
        const cutoff = this.dispute_window_cutoff();
        const ready = await this.state.list_awaiting_solana_submission(cutoff);
        for (const row of ready) {
            await this.submit_one_safely(row);
        }
    }

    private dispute_window_cutoff(): Date {
        const hours = ENV.HEDGER_RESOLVER_DISPUTE_WINDOW_HOURS;
        return new Date(Date.now() - hours * 60 * 60 * 1000);
    }

    private async submit_one_safely(row: ResolverStateRow): Promise<void> {
        try {
            await this.submit_one(row);
        } catch (err) {
            this.log.error({ err, marketId: row.marketId }, "solana resolution submit failed");
            await this.events.record_alert("resolver", "solana resolve_market submission failed", {
                marketId: row.marketId,
                error: (err as Error)?.message ?? String(err),
            });
        }
    }

    private async submit_one(row: ResolverStateRow): Promise<void> {
        const market = await prisma.market.findUnique({
            where: { id: row.marketId },
            select: { id: true, name: true, solanaMarketPda: true, polyMarketId: true },
        });
        if (!market?.solanaMarketPda) {
            this.log.warn(
                { marketId: row.marketId },
                "market missing solanaMarketPda — cannot submit",
            );
            return;
        }
        if (!row.winningOutcome) {
            this.log.warn(
                { marketId: row.marketId },
                "ResolverState has no winningOutcome — refusing to submit",
            );
            return;
        }

        const result = await this.submitter.submit({
            marketPda: market.solanaMarketPda,
            winningOutcome: row.winningOutcome,
        });
        await this.state.record_solana_resolved(row.marketId, result.signature, result.submittedAt);

        this.log.info(
            {
                marketId: row.marketId,
                polyMarketId: market.polyMarketId,
                marketPda: market.solanaMarketPda,
                winningOutcome: row.winningOutcome,
                txSig: result.signature,
            },
            ">>> RESOLVER: resolve_market submitted to Solana",
        );

        await this.events.record({
            level: "INFO",
            category: "resolver",
            message: "resolve_market tx confirmed",
            payload: {
                marketId: row.marketId,
                polyMarketId: market.polyMarketId,
                winningOutcome: row.winningOutcome,
                txSig: result.signature,
            },
        });
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
            stage === "POLYMARKET_RESOLVED" || stage === "SOLANA_RESOLVED" || stage === "REDEEMED"
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
        const winning_outcome: Outcome = resolution.winningOutcomeIndex === 0 ? "YES" : "NO";
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
