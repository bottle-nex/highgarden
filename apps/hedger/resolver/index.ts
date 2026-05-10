import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { Outcome } from "@solmarket/database";
import { SolmarketClient } from "@solmarket/contract";
import bs58 from "bs58";

import { ENV } from "../envs/env";
import { logger_for } from "../log/log";
import type SolanaClient from "../clients/solana";
import type PolymarketClient from "../clients/polymarket";
import type { GammaResolution, RedeemOutcome } from "../clients/polymarket";
import Market from "../db/market";
import ResolverDb from "../db/resolver";
import type { ResolverStateRow } from "../db/resolver";

interface MarketCandidate {
    marketId: string;
    polyMarketId: string;
    name: string;
    solanaMarketPda: string;
}

/**
 * The complete v2 Resolver service. One periodic loop, three stages
 * per tick:
 *
 *   1. **Detect** — for every market with a Solana PDA, ask Polymarket
 *      gamma whether the market has closed and whether the winning
 *      outcome is unambiguous. Record the answer in `ResolverState`.
 *
 *   2. **Submit on Solana** — for markets that crossed step 1 *and*
 *      whose `polymarketResolvedAt` is older than the configured
 *      dispute window, sign and send the on-chain `resolve_market`
 *      instruction so users can claim.
 *
 *   3. **Redeem on Polygon** — for markets that crossed step 2, call
 *      `redeemPositions` on the Polygon CTF contract to pull our
 *      USDC.e back from Polymarket.
 *
 * v1 had this split across 3 files (`resolver/poll.ts`,
 * `resolver/submit-solana.ts`, `polymarket/redeem.ts`); v2 keeps it
 * in one class because the three stages are only ever exercised
 * sequentially per market and never independently. The Polymarket
 * redemption call lives on `PolymarketClient` (the external surface);
 * what's here is just orchestration.
 *
 * Single-flight: each tick checks `running` and bails if a previous
 * tick is still processing — same pattern as the ingester poller.
 */
export default class Resolver {
    private readonly log = logger_for("resolver");
    private readonly poly: PolymarketClient;
    private interval_handle: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private warned_oracle_unconfigured = false;
    private warned_redeem_unconfigured = false;
    private oracle_keypair: Keypair | null = null;
    private oracle_client: SolmarketClient | null = null;

    constructor(_solana: SolanaClient, poly: PolymarketClient) {
        this.poly = poly;
    }

    // ──────────────── Lifecycle ────────────────

    public start(): void {
        if (this.interval_handle) return;
        void this.tick();
        this.interval_handle = setInterval(
            () => void this.tick(),
            ENV.HEDGER_RESOLVER_POLL_INTERVAL_MS,
        );
        this.log.info({ intervalMs: ENV.HEDGER_RESOLVER_POLL_INTERVAL_MS }, "resolver started");
    }

    public stop(): void {
        if (this.interval_handle) {
            clearInterval(this.interval_handle);
            this.interval_handle = null;
        }
    }

    /**
     * Single-flight tick. Each stage is independently `try`-wrapped so a
     * failure in one (e.g. gamma is down) doesn't block the others. The
     * tick itself swallows + logs at the top level — the loop must keep
     * scheduling regardless of individual market failures.
     */
    private async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.detect_polymarket_resolutions();
            await this.submit_solana_for_resolved();
            await this.redeem_polygon_for_resolved();
        } catch (err) {
            this.log.error({ err }, "resolver tick failed");
        } finally {
            this.running = false;
        }
    }

    // ──────────────── Stage 1: detect Polymarket resolution ────────────────

    private async detect_polymarket_resolutions(): Promise<void> {
        const candidates = await this.list_pending_candidates();
        for (const candidate of candidates) {
            try {
                await this.check_one(candidate);
            } catch (err) {
                this.log.error({ err, marketId: candidate.marketId }, "resolver check failed");
            }
        }
    }

    /**
     * Markets eligible for resolution checking: those with a Solana PDA
     * and whose `ResolverState.stage` has not yet entered any of the
     * post-resolution stages. We pre-filter in the DB and finish-filter
     * in memory — the row count is small (markets, not fills) so this
     * is cheap.
     */
    private async list_pending_candidates(): Promise<MarketCandidate[]> {
        const rows = await Market.list_with_pda();
        const filtered: MarketCandidate[] = [];
        for (const row of rows) {
            const state = await ResolverDb.find(row.id);
            if (this.is_terminal_stage(state?.stage)) continue;
            filtered.push({
                marketId: row.id,
                polyMarketId: row.polyMarketId,
                name: row.name,
                solanaMarketPda: row.solanaMarketPda,
            });
        }
        return filtered;
    }

    private is_terminal_stage(stage: string | undefined): boolean {
        return (
            stage === "POLYMARKET_RESOLVED" || stage === "SOLANA_RESOLVED" || stage === "REDEEMED"
        );
    }

    private async check_one(candidate: MarketCandidate): Promise<void> {
        const resolution = await this.poly.fetch_resolution(candidate.polyMarketId);
        if (!resolution || !resolution.closed) return;
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

        const existing = await ResolverDb.find(candidate.marketId);
        if (existing?.polymarketResolvedAt) return;

        const row = await ResolverDb.record_polymarket_resolved(
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
    }

    // ──────────────── Stage 2: submit on Solana ────────────────

    private async submit_solana_for_resolved(): Promise<void> {
        if (!ENV.HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR) {
            if (!this.warned_oracle_unconfigured) {
                this.log.warn(
                    "HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR not set — skipping Solana resolve_market submission",
                );
                this.warned_oracle_unconfigured = true;
            }
            return;
        }
        const cutoff = this.dispute_window_cutoff();
        const ready = await ResolverDb.list_awaiting_solana_submission(cutoff);
        for (const row of ready) {
            try {
                await this.submit_one(row);
            } catch (err) {
                this.log.error({ err, marketId: row.marketId }, "solana resolution submit failed");
            }
        }
    }

    /**
     * The dispute window is ops insurance: Polymarket's UMA-backed
     * resolutions can in principle be challenged for a configured
     * window. We delay forwarding to Solana by `HEDGER_RESOLVER_DISPUTE_WINDOW_HOURS`
     * to ensure the gamma payout is final.
     */
    private dispute_window_cutoff(): Date {
        return new Date(Date.now() - ENV.HEDGER_RESOLVER_DISPUTE_WINDOW_HOURS * 60 * 60 * 1000);
    }

    private async submit_one(row: ResolverStateRow): Promise<void> {
        const market = await Market.get_summary_by_id(row.marketId);
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

        const signature = await this.send_resolve_to_solana(
            market.solanaMarketPda,
            row.winningOutcome,
        );
        await ResolverDb.record_solana_resolved(row.marketId, signature, new Date());

        this.log.info(
            {
                marketId: row.marketId,
                polyMarketId: market.polyMarketId,
                marketPda: market.solanaMarketPda,
                winningOutcome: row.winningOutcome,
                txSig: signature,
            },
            ">>> RESOLVER: resolve_market submitted to Solana",
        );
    }

    private async send_resolve_to_solana(
        market_pda: string,
        winning_outcome: Outcome,
    ): Promise<string> {
        const client = this.get_oracle_client();
        const outcome_int = winning_outcome === "YES" ? 0 : 1;
        return client.resolveMarket({
            oracleSigner: this.get_oracle_keypair().publicKey,
            market: new PublicKey(market_pda),
            winningOutcome: outcome_int as 0 | 1,
        });
    }

    // ──────────────── Stage 3: redeem on Polygon ────────────────

    private async redeem_polygon_for_resolved(): Promise<void> {
        if (!this.poly.is_redeem_configured()) {
            if (!this.warned_redeem_unconfigured) {
                this.log.warn(
                    "polygon redeem disabled — set HEDGER_POLYGON_RPC_URL + HEDGER_POLYMARKET_PRIVATE_KEY to enable",
                );
                this.warned_redeem_unconfigured = true;
            }
            return;
        }
        const ready = await ResolverDb.list_awaiting_redemption();
        for (const row of ready) {
            try {
                await this.redeem_one(row);
            } catch (err) {
                this.log.error({ err, marketId: row.marketId }, "polygon redeem failed");
            }
        }
    }

    private async redeem_one(row: ResolverStateRow): Promise<void> {
        const market = await Market.get_summary_by_id(row.marketId);
        if (!market) return;

        const outcome: RedeemOutcome = await this.poly.redeem_positions(market.polyMarketId);
        await this.handle_redeem_outcome(row.marketId, market.polyMarketId, market.name, outcome);
    }

    private async handle_redeem_outcome(
        market_id: string,
        polymarket_market_id: string,
        name: string,
        outcome: RedeemOutcome,
    ): Promise<void> {
        if (outcome.kind === "submitted") {
            await ResolverDb.record_redeemed(market_id, outcome.txHash, new Date());
            this.log.info(
                {
                    marketId: market_id,
                    polyMarketId: polymarket_market_id,
                    name,
                    txHash: outcome.txHash,
                },
                ">>> RESOLVER: polygon redemption confirmed",
            );
            return;
        }
        if (outcome.kind === "skipped_neg_risk" || outcome.kind === "skipped_no_condition_id") {
            await ResolverDb.append_note(market_id, `redeem_skipped: ${outcome.kind}`);
            this.log.warn(
                {
                    marketId: market_id,
                    polyMarketId: polymarket_market_id,
                    reason: outcome.kind,
                },
                "redemption skipped — manual action required",
            );
            return;
        }
        // skipped_not_resolved → silent retry next tick
    }

    // ──────────────── Oracle client (lazy) ────────────────

    /**
     * Lazily constructs a `SolmarketClient` whose `defaultSigner` is the
     * oracle keypair. Separate from the `Hedger`'s admin client because
     * (a) different keypair, (b) different responsibility (oracle signs
     * `resolve_market`, admin signs `pause_market`).
     */
    private get_oracle_client(): SolmarketClient {
        if (!this.oracle_client) {
            const connection = new Connection(ENV.HEDGER_SOLANA_RPC_URL, "confirmed");
            this.oracle_client = new SolmarketClient({
                connection,
                programId: new PublicKey(ENV.HEDGER_SOLANA_PROGRAM_ID),
                defaultSigner: this.get_oracle_keypair(),
            });
        }
        return this.oracle_client;
    }

    private get_oracle_keypair(): Keypair {
        if (!this.oracle_keypair) {
            this.oracle_keypair = this.load_keypair(ENV.HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR!);
        }
        return this.oracle_keypair;
    }

    private load_keypair(encoded: string): Keypair {
        const trimmed = encoded.trim();
        if (trimmed.startsWith("[")) {
            const arr = JSON.parse(trimmed) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        return Keypair.fromSecretKey(bs58.decode(trimmed));
    }
}
