import { prisma } from "@solmarket/database";
import type { GammaResolution } from "@solmarket/polymarket-client";
import { ENV } from "../envs/env";
import { logger_for } from "../log/log";
import type PolymarketClient from "../clients/polymarket";

/** Reason string written to `Market.pausedReason` when Polymarket has
 *  closed the market but the winner is not yet determinable because of
 *  an open UMA dispute. The server's validate() + claim service surface
 *  this reason to the user. */
const REASON_UMA_DISPUTE = "UMA_DISPUTE";

interface CandidateMarket {
    id: string;
    name: string;
    polyMarketId: string;
    status: "OPEN" | "PAUSED" | "RESOLVED" | "CANCELLED";
    winningOutcome: "YES" | "NO" | null;
    pausedReason: string | null;
}

interface TargetState {
    status: "OPEN" | "PAUSED" | "RESOLVED";
    winningOutcome: "YES" | "NO" | null;
    resolvedAt: Date | null;
    pausedReason: string | null;
}

/**
 * Periodically polls Polymarket gamma for every approved-and-listed
 * market and mirrors the resolution state into `Market.status` /
 * `Market.pausedReason` / `Market.winningOutcome` so the server's
 * trade-time validate() and claim service can reject closed markets
 * without re-hitting gamma on every request.
 *
 * Three target states:
 *
 *   1. gamma `closed: true` + winning outcome determined
 *      → `Market.status = RESOLVED`, winningOutcome set, resolvedAt
 *        set, pausedReason cleared. Unlocks claim once the on-chain
 *        resolve_market lands (handled by the sibling Resolver).
 *
 *   2. gamma `closed: true` + winning outcome not yet determinable
 *      (UMA dispute in progress)
 *      → `Market.status = PAUSED`, pausedReason = "UMA_DISPUTE".
 *        Server rejects trades + claims with a UMA-specific message.
 *
 *   3. gamma `closed: false` + we previously paused for UMA_DISPUTE
 *      → revert to `Market.status = OPEN`, clear pausedReason. Covers
 *        the (rare) case where Polymarket flips the flag back.
 *
 * Otherwise — no DB write. Avoids spurious updates and keeps the audit
 * log clean.
 *
 * This loop is intentionally separate from the on-chain Resolver in
 * `apps/hedger/resolver/`: that one drives `resolve_market` + CTF
 * redeem and requires an oracle keypair to be configured. The DB
 * mirror runs unconditionally so the user-facing UI is correct even
 * when oracle credentials are not present.
 */
export default class MarketStatusPoller {
    private readonly log = logger_for("market-status-poller");
    private interval_handle: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(private readonly poly: PolymarketClient) {}

    public start(): void {
        if (this.interval_handle) return;
        void this.tick();
        this.interval_handle = setInterval(
            () => void this.tick(),
            ENV.HEDGER_MARKET_STATUS_POLL_INTERVAL_MS,
        );
        this.log.info(
            { intervalMs: ENV.HEDGER_MARKET_STATUS_POLL_INTERVAL_MS },
            "market-status poller started",
        );
    }

    public stop(): void {
        if (this.interval_handle) {
            clearInterval(this.interval_handle);
            this.interval_handle = null;
        }
    }

    /**
     * Single-flight tick: if a previous tick is still running, bail so we
     * never have two gamma sweeps in flight in parallel. Top-level
     * try/catch keeps the timer alive across transient gamma failures.
     */
    private async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const candidates = await this.list_candidates();
            for (const market of candidates) {
                try {
                    await this.check_one(market);
                } catch (err) {
                    this.log.error({ err, marketId: market.id }, "market-status check failed");
                }
            }
        } catch (err) {
            this.log.error({ err }, "market-status tick failed");
        } finally {
            this.running = false;
        }
    }

    /**
     * Approved markets with a Solana PDA. Same filter as the on-chain
     * Resolver so the two loops agree on the candidate set, but here we
     * also pull in RESOLVED rows for re-open detection — if gamma flips
     * back from closed, we want to know. RESOLVED rows with a known
     * winner stay terminal: no further work to do.
     */
    private async list_candidates(): Promise<CandidateMarket[]> {
        const rows = await prisma.market.findMany({
            where: {
                solanaMarketPda: { not: null },
                listing: { status: "APPROVED" },
            },
            select: {
                id: true,
                name: true,
                polyMarketId: true,
                status: true,
                winningOutcome: true,
                pausedReason: true,
            },
        });
        return rows.filter((r) => !this.is_terminal(r));
    }

    /** RESOLVED with a known winner — no amount of polling moves this. */
    private is_terminal(row: CandidateMarket): boolean {
        return row.status === "RESOLVED" && row.winningOutcome !== null;
    }

    private async check_one(market: CandidateMarket): Promise<void> {
        const resolution = await this.poly.fetch_resolution(market.polyMarketId);
        if (!resolution) return; // gamma unreachable for this id — try next tick
        const target = this.compute_target(market, resolution);
        if (!target) return;
        await this.apply_target(market, target);
    }

    /**
     * Maps `(current row, gamma resolution)` to the row's target state.
     * Returns null when no write is needed.
     */
    private compute_target(
        current: CandidateMarket,
        resolution: GammaResolution,
    ): TargetState | null {
        if (resolution.closed && resolution.winningOutcomeIndex !== null) {
            return this.target_resolved(current, resolution);
        }
        if (resolution.closed) {
            return this.target_uma_paused(current, resolution);
        }
        return this.target_reopen(current);
    }

    private target_resolved(
        current: CandidateMarket,
        resolution: GammaResolution,
    ): TargetState | null {
        const winning_outcome: "YES" | "NO" = resolution.winningOutcomeIndex === 0 ? "YES" : "NO";
        if (
            current.status === "RESOLVED"
            && current.winningOutcome === winning_outcome
            && current.pausedReason === null
        ) {
            return null;
        }
        return {
            status: "RESOLVED",
            winningOutcome: winning_outcome,
            resolvedAt: resolution.resolvedAt ?? new Date(),
            pausedReason: null,
        };
    }

    private target_uma_paused(
        current: CandidateMarket,
        _resolution: GammaResolution,
    ): TargetState | null {
        if (current.status === "PAUSED" && current.pausedReason === REASON_UMA_DISPUTE) {
            return null;
        }
        return {
            status: "PAUSED",
            winningOutcome: null,
            resolvedAt: null,
            pausedReason: REASON_UMA_DISPUTE,
        };
    }

    /**
     * Re-open path: only flip a market back to OPEN when we previously
     * paused it for UMA_DISPUTE. Admin-paused markets (or anything else
     * that set status = PAUSED for a non-UMA reason) are left alone.
     */
    private target_reopen(current: CandidateMarket): TargetState | null {
        if (current.status === "PAUSED" && current.pausedReason === REASON_UMA_DISPUTE) {
            return {
                status: "OPEN",
                winningOutcome: null,
                resolvedAt: null,
                pausedReason: null,
            };
        }
        return null;
    }

    private async apply_target(market: CandidateMarket, target: TargetState): Promise<void> {
        await prisma.market.update({
            where: { id: market.id },
            data: {
                status: target.status,
                winningOutcome: target.winningOutcome,
                resolvedAt: target.resolvedAt,
                pausedReason: target.pausedReason,
            },
        });
        this.log.info(
            {
                marketId: market.id,
                name: market.name,
                from: {
                    status: market.status,
                    winningOutcome: market.winningOutcome,
                    pausedReason: market.pausedReason,
                },
                to: target,
            },
            ">>> MARKET-STATUS: DB state updated from gamma",
        );
    }
}
