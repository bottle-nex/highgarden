import type { Job } from "bullmq";
import type { Side, Outcome } from "@solmarket/database";
import { ENV } from "../envs/env";
import { logger_for } from "../log/log";
import { RetryableError } from "../errors";
import type { HedgeJobData, HedgeJobResult } from "./types";
import User, { type CustodialUser } from "../db/user";
import Market, { type MarketMetadata } from "../db/market";
import Fill, { type FillRow } from "../db/fill";
import Hedge, { type HedgeRow } from "../db/hedge";
import Exposure from "../db/exposure";
import type PolymarketClient from "../clients/polymarket";
import type { PlaceMarketOrderResult, BookTop } from "../clients/polymarket";
import chalk from "chalk";

/**
 * Direction picker output: which Polymarket token + which side gives us
 * the offsetting position to a Solana fill on (side, outcome).
 */
interface HedgeDirection {
    tokenId: string;
    polymarketSide: Side;
    outcome: Outcome;
}

/**
 * Everything one job needs after the boot-strap lookups complete. Held
 * as a single value so step functions don't have to thread half a dozen
 * args around.
 */
interface ResolvedContext {
    user: CustodialUser;
    market: MarketMetadata;
    fill: FillRow;
    hedge: HedgeRow;
    direction: HedgeDirection;
}

/**
 * Internal accumulator for the walk-book loop. Tracks running totals
 * across multiple fills as the hedger steps through Polymarket's book
 * looking for liquidity within the slippage cap.
 */
interface WalkAccumulator {
    filled: number;
    usdc_paid: number;
    attempts: number;
    last_order_id: string | null;
    budget_exhausted: boolean;
}

/**
 * Turns one BullMQ job into a Polymarket counter-order. Owns no
 * resources — its collaborators (repos, polymarket client) live longer
 * than any single job, and the BullMQ worker is what calls
 * {@link handle} per dequeue.
 *
 * Logic that used to live in three v1 files (`direction.ts`,
 * `walk-book.ts`, `processor.ts`) is consolidated here as private
 * methods because each had exactly one consumer.
 *
 * Error handling: lookup failures throw {@link RetryableError} (the
 * row may not have replicated yet); Polymarket order failures are
 * already classified inside `place_market_order`. Anything else
 * propagates as-is and BullMQ's exponential backoff handles retries.
 */
export default class HedgeProcessor {
    private readonly log = logger_for("processor");
    private readonly poly: PolymarketClient;

    constructor(poly: PolymarketClient) {
        this.poly = poly;
    }

    /**
     * Entry point invoked once per dequeue. Returns the terminal result
     * the worker reports to BullMQ (FILLED / PARTIAL / FAILED / SKIPPED).
     *
     * Flow:
     *   1. Resolve context — user, market, fill, hedge rows.
     *   2. If the hedge is already in a terminal status (FILLED, PARTIAL,
     *      FAILED), short-circuit with SKIPPED — protects against double
     *      execution after a worker crash mid-job.
     *   3. Mark HEDGING + bump exposure on first attempt.
     *   4. Execute — initial FAK at top of book, walk if partial.
     */
    public async handle(job: Job<HedgeJobData>): Promise<HedgeJobResult> {
        this.log.info({ jobId: job.id, attemptsMade: job.attemptsMade }, "processing job");

        const ctx = await this.resolve_context(job);
        console.debug(chalk.bgGreen("context returned is :"), ctx);
        if (this.is_terminal(ctx.hedge)) {
            return {
                status: "SKIPPED",
                reason: `hedge already in terminal state: ${ctx.hedge.status}`,
            };
        }

        await Hedge.mark_hedging(ctx.hedge.id, job.attemptsMade + 1);
        if (job.attemptsMade === 0) {
            // BUY pushes unhedged up (we owe shares); SELL pulls it down
            // (we have excess). Hedge completion reverses by the same magnitude.
            await Exposure.apply_signed_delta(
                ctx.market.id,
                HedgeProcessor.signed_notional_usd(
                    ctx.fill.price,
                    ctx.fill.size,
                    ctx.fill.side,
                ),
            );
        }
        return this.execute_hedge(ctx);
    }

    /** priceCents × shares → whole-dollar notional (unsigned). */
    private static notional_usd(price_cents: number, shares: number): number {
        return Math.round((price_cents * shares) / 100);
    }

    /** Signed by trade direction. BUY = +, SELL = −. Used for exposure tracking. */
    private static signed_notional_usd(
        price_cents: number,
        shares: number,
        side: Side,
    ): number {
        const magnitude = HedgeProcessor.notional_usd(price_cents, shares);
        return side === "BUY" ? magnitude : -magnitude;
    }

    // ──────────────── Context resolution ────────────────

    /**
     * Inflates a job payload into rich domain objects, creating Fill /
     * Hedge rows idempotently along the way. Idempotency is critical —
     * the listener and poller both feed `on_fill`, so the same job may
     * be enqueued twice and we may dequeue it more than once.
     */
    private async resolve_context(job: Job<HedgeJobData>): Promise<ResolvedContext> {
        const data = job.data;
        const user = await this.lookup_user(data.event.user);
        const market = await this.lookup_market(data.event.market);
        const fill = await this.upsert_fill(data, user.id, market.id);

        console.debug(chalk.bgCyan("-------------------------->"), {
            data,
            user,
            market,
            fill,
        });

        const direction = this.pick_direction({
            solana_side: data.event.side,
            solana_outcome: data.event.outcome,
            yes_token_id: market.yesTokenId,
            no_token_id: market.noTokenId,
        });
        console.debug(chalk.bgCyan("direction-------------------------->"), { direction });
        const hedge = await this.upsert_hedge(fill.id, job.id!, direction, fill.size);
        console.debug(chalk.bgRed("hedge-------------------------->"), { hedge });
        return { user, market, fill, hedge, direction };
    }

    private async lookup_user(custodial_pubkey: string): Promise<CustodialUser> {
        const user = await User.find_by_custodial_pubkey(custodial_pubkey);
        if (!user) {
            throw new RetryableError(`no User row with custodialPublicKey=${custodial_pubkey}`);
        }
        return user;
    }

    private async lookup_market(solana_pda: string): Promise<MarketMetadata> {
        const market = await Market.find_by_pda(solana_pda);
        if (!market) {
            throw new RetryableError(`no Market row with solanaMarketPda=${solana_pda}`);
        }
        return market;
    }

    private async upsert_fill(
        data: HedgeJobData,
        user_id: string,
        market_id: string,
    ): Promise<FillRow> {
        const result = await Fill.insert_idempotent({
            nonceHex: data.event.nonceHex,
            txSignature: data.signature,
            userId: user_id,
            marketId: market_id,
            side: this.side_from(data.event.side),
            outcome: this.outcome_from(data.event.outcome),
            priceCents: data.event.price,
            sizeShares: Number(data.event.size),
        });
        return result.row;
    }

    private async upsert_hedge(
        fill_id: string,
        bull_job_id: string,
        direction: HedgeDirection,
        size_shares: number,
    ): Promise<HedgeRow> {
        const client_order_id = `hedger-${bull_job_id}`;
        const result = await Hedge.create_idempotent({
            fillId: fill_id,
            bullJobId: bull_job_id,
            clientOrderId: client_order_id,
            polymarketTokenId: direction.tokenId,
            polymarketSide: direction.polymarketSide,
            requestedSize: size_shares,
        });
        return result.row;
    }

    private is_terminal(hedge: HedgeRow): boolean {
        return hedge.status === "FILLED" || hedge.status === "PARTIAL" || hedge.status === "FAILED";
    }

    // ──────────────── Direction picker (was direction.ts) ────────────────

    /**
     * Translates the Solana fill (side, outcome) into the offsetting
     * Polymarket position. The mapping:
     *
     *   solana side 0=BUY,  outcome 0=YES → buy YES on Polymarket
     *   solana side 0=BUY,  outcome 1=NO  → buy NO on Polymarket
     *   solana side 1=SELL, outcome 0=YES → sell YES on Polymarket
     *   solana side 1=SELL, outcome 1=NO  → sell NO on Polymarket
     *
     * The token id is selected from the market metadata based on the
     * outcome.
     */
    private pick_direction(input: {
        solana_side: number;
        solana_outcome: number;
        yes_token_id: string;
        no_token_id: string;
    }): HedgeDirection {
        const outcome = this.outcome_from(input.solana_outcome);
        const polymarketSide = this.side_from(input.solana_side);
        const tokenId = outcome === "YES" ? input.yes_token_id : input.no_token_id;
        return { tokenId, polymarketSide, outcome };
    }

    // ──────────────── Execution ────────────────

    /**
     * Places the initial FAK order at top of book; if it doesn't fully
     * fill, walks the book up to the slippage cap. Persists the terminal
     * hedge state and returns the matching `HedgeJobResult`.
     */
    private async execute_hedge(ctx: ResolvedContext): Promise<HedgeJobResult> {
        const target_price = await this.target_price_cents(ctx);
        this.announce_hedge_attempt(ctx, target_price);

        const initial = await this.poly.place_market_order({
            tokenId: ctx.direction.tokenId,
            side: ctx.direction.polymarketSide,
            sizeShares: ctx.fill.size,
            priceCents: target_price,
            tickSize: ctx.market.tickSize,
            negRisk: ctx.market.negRisk,
            clientOrderId: ctx.hedge.clientOrderId!,
        });

        if (initial.fullyFilled) return this.finalize_filled(ctx, initial);
        return this.finalize_partial(ctx, initial, target_price);
    }

    private announce_hedge_attempt(ctx: ResolvedContext, target_price: number): void {
        this.log.info(
            {
                marketId: ctx.market.id,
                polymarketMarketId: ctx.market.polyMarketId,
                tokenId: ctx.direction.tokenId,
                outcome: ctx.direction.outcome,
                polymarketSide: ctx.direction.polymarketSide,
                shares: ctx.fill.size,
                priceCents: target_price,
                clientOrderId: ctx.hedge.clientOrderId,
                solanaUserBought: ctx.fill.side,
            },
            ">>> HEDGE: attempting to buy/sell on Polymarket",
        );
    }

    /**
     * Picks the limit price for the initial FAK attempt. We use the top
     * of book on the side we're crossing — best ask if buying, best bid
     * if selling. Falls back to the user's solana fill price if the book
     * fetch fails or the side has no quote (rare; would be an empty
     * book).
     */
    private async target_price_cents(ctx: ResolvedContext): Promise<number> {
        const top: BookTop = await this.poly.get_top_of_book(ctx.direction.tokenId);
        if (ctx.direction.polymarketSide === "BUY") return top.bestAskCents ?? ctx.fill.price;
        return top.bestBidCents ?? ctx.fill.price;
    }

    // ──────────────── Walk-book (was walk-book.ts) ────────────────

    /**
     * Steps the limit price by 1 cent at a time toward the adversarial
     * direction (up if buying, down if selling) until either the desired
     * size is filled or the configured slippage cap is reached.
     *
     * Each step submits a fresh FAK with a derived clientOrderId so it
     * coexists with the initial attempt — Polymarket dedupes per
     * clientOrderId, so reusing the same id would be a no-op.
     */
    private async walk_book(input: {
        tokenId: string;
        side: Side;
        remainingShares: number;
        initialPriceCents: number;
        tickSize: string;
        negRisk: boolean;
        clientOrderIdBase: string;
    }): Promise<{
        totalFilledShares: number;
        weightedAvgPriceCents: number | null;
        lastOrderId: string | null;
        slippageBudgetExhausted: boolean;
        attempts: number;
    }> {
        const acc: WalkAccumulator = {
            filled: 0,
            usdc_paid: 0,
            attempts: 0,
            last_order_id: null,
            budget_exhausted: false,
        };

        const max_price =
            input.side === "BUY"
                ? input.initialPriceCents + ENV.HEDGER_SLIPPAGE_LIMIT_CENTS
                : input.initialPriceCents - ENV.HEDGER_SLIPPAGE_LIMIT_CENTS;

        let current_price = input.initialPriceCents;

        while (acc.filled < input.remainingShares) {
            if (this.price_outside_budget(input.side, current_price, max_price)) {
                acc.budget_exhausted = true;
                this.log.warn(
                    { current_price, max_price, side: input.side },
                    "slippage budget exhausted",
                );
                break;
            }

            const remaining = input.remainingShares - acc.filled;
            acc.attempts += 1;
            const result = await this.poly.place_market_order({
                tokenId: input.tokenId,
                side: input.side,
                sizeShares: remaining,
                priceCents: current_price,
                tickSize: input.tickSize,
                negRisk: input.negRisk,
                clientOrderId: `${input.clientOrderIdBase}-walk-${acc.attempts}`,
            });

            this.merge_walk_result(acc, result);

            if (result.fullyFilled || result.filledShares === remaining) break;
            if (result.filledShares === 0) {
                acc.budget_exhausted = true;
                this.log.warn({ current_price }, "step returned 0 fills, stopping walk");
                break;
            }
            current_price = input.side === "BUY" ? current_price + 1 : current_price - 1;
        }

        const avg = acc.filled > 0 ? Math.round(acc.usdc_paid / acc.filled) : null;
        return {
            totalFilledShares: acc.filled,
            weightedAvgPriceCents: avg,
            lastOrderId: acc.last_order_id,
            slippageBudgetExhausted: acc.budget_exhausted,
            attempts: acc.attempts,
        };
    }

    private merge_walk_result(acc: WalkAccumulator, result: PlaceMarketOrderResult): void {
        acc.filled += result.filledShares;
        if (result.avgPriceCents !== null) {
            acc.usdc_paid += result.filledShares * result.avgPriceCents;
        }
        if (result.polymarketOrderId) acc.last_order_id = result.polymarketOrderId;
    }

    private price_outside_budget(side: Side, current: number, max: number): boolean {
        return side === "BUY" ? current > max : current < max;
    }

    // ──────────────── Finalize ────────────────

    private async finalize_filled(
        ctx: ResolvedContext,
        result: PlaceMarketOrderResult,
    ): Promise<HedgeJobResult> {
        await Hedge.mark_filled(
            ctx.hedge.id,
            result.polymarketOrderId ?? "unknown",
            result.filledShares,
            result.avgPriceCents ?? ctx.fill.price,
        );
        // Reverse the fill's signed delta so exposure returns toward zero,
        // regardless of slippage on the hedge price itself.
        await Exposure.apply_signed_delta(
            ctx.market.id,
            -HedgeProcessor.signed_notional_usd(
                ctx.fill.price,
                result.filledShares,
                ctx.fill.side,
            ),
        );
        return {
            status: "FILLED",
            filledSize: result.filledShares,
            avgPriceCents: result.avgPriceCents ?? undefined,
            polymarketOrderId: result.polymarketOrderId ?? undefined,
        };
    }

    /**
     * Initial FAK only partially filled — walk the book on the remainder.
     * If the walk fills the rest, mark FILLED. Otherwise mark PARTIAL and
     * leave the unfilled shares as residual exposure for ops to handle.
     */
    private async finalize_partial(
        ctx: ResolvedContext,
        initial: PlaceMarketOrderResult,
        target_price: number,
    ): Promise<HedgeJobResult> {
        const remaining = ctx.fill.size - initial.filledShares;
        const next_initial_price =
            ctx.direction.polymarketSide === "BUY" ? target_price + 1 : target_price - 1;

        const walk = await this.walk_book({
            tokenId: ctx.direction.tokenId,
            side: ctx.direction.polymarketSide,
            remainingShares: remaining,
            initialPriceCents: next_initial_price,
            tickSize: ctx.market.tickSize,
            negRisk: ctx.market.negRisk,
            clientOrderIdBase: ctx.hedge.clientOrderId!,
        });

        const total_filled = initial.filledShares + walk.totalFilledShares;
        const avg = this.combined_avg(
            initial.filledShares,
            initial.avgPriceCents,
            walk.totalFilledShares,
            walk.weightedAvgPriceCents,
        );

        if (total_filled >= ctx.fill.size) {
            await Hedge.mark_filled(
                ctx.hedge.id,
                walk.lastOrderId ?? initial.polymarketOrderId ?? "unknown",
                total_filled,
                avg ?? ctx.fill.price,
            );
            await Exposure.apply_signed_delta(
                ctx.market.id,
                -HedgeProcessor.signed_notional_usd(
                    ctx.fill.price,
                    total_filled,
                    ctx.fill.side,
                ),
            );
            return { status: "FILLED", filledSize: total_filled, avgPriceCents: avg ?? undefined };
        }

        await Hedge.mark_partial(
            ctx.hedge.id,
            walk.lastOrderId ?? initial.polymarketOrderId,
            total_filled,
            avg,
        );
        if (total_filled > 0) {
            await Exposure.apply_signed_delta(
                ctx.market.id,
                -HedgeProcessor.signed_notional_usd(
                    ctx.fill.price,
                    total_filled,
                    ctx.fill.side,
                ),
            );
        }
        this.log.warn(
            {
                hedgeId: ctx.hedge.id,
                requested: ctx.fill.size,
                filled: total_filled,
            },
            "hedge partial — slippage cap reached",
        );
        return {
            status: "PARTIAL",
            filledSize: total_filled,
            avgPriceCents: avg ?? undefined,
            reason: "slippage cap reached",
        };
    }

    /**
     * Weighted-average price across the initial fill and the walk-book
     * fills. Used purely for reporting; on-chain has no concept of avg.
     */
    private combined_avg(
        a_filled: number,
        a_avg: number | null,
        b_filled: number,
        b_avg: number | null,
    ): number | null {
        const total = a_filled + b_filled;
        if (total === 0) return null;
        const a_total = (a_avg ?? 0) * a_filled;
        const b_total = (b_avg ?? 0) * b_filled;
        return Math.round((a_total + b_total) / total);
    }

    // ──────────────── Enum mapping ────────────────

    private side_from(raw: number): Side {
        return raw === 0 ? "BUY" : "SELL";
    }

    private outcome_from(raw: number): Outcome {
        return raw === 0 ? "YES" : "NO";
    }
}
