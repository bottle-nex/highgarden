import type { Job } from "bullmq";
import LoggerFactory from "../log/logger";
import { RetryableError } from "../errors";
import type { HedgeJobData, HedgeJobResult } from "../queue/types";
import UserRepo, { type CustodialUser } from "../db/user.repo";
import MarketRepo, { type MarketMetadata } from "../db/market.repo";
import FillRepo, { type FillRow } from "../db/fill.repo";
import HedgeRepo, { type HedgeRow } from "../db/hedge.repo";
import ExposureRepo from "../db/exposure.repo";
import EventRepo from "../db/event.repo";
import DirectionResolver, { type PolymarketHedgeSpec } from "./direction";
import PolymarketBookService from "../polymarket/book";
import PolymarketOrderService from "../polymarket/orders";
import WalkBookExecutor from "./walk-book";
import type { Side, Outcome } from "@solmarket/database";

interface ResolvedContext {
    user: CustodialUser;
    market: MarketMetadata;
    fill: FillRow;
    hedge: HedgeRow;
    spec: PolymarketHedgeSpec;
}

export default class HedgeProcessor {
    private readonly log = LoggerFactory.for_category("processor");
    private readonly users = new UserRepo();
    private readonly markets = new MarketRepo();
    private readonly fills = new FillRepo();
    private readonly hedges = new HedgeRepo();
    private readonly exposure = new ExposureRepo();
    private readonly events = new EventRepo();
    private readonly direction = new DirectionResolver();
    private readonly book = new PolymarketBookService();
    private readonly orders = new PolymarketOrderService();
    private readonly walker = new WalkBookExecutor(this.orders);

    public async handle(job: Job<HedgeJobData>): Promise<HedgeJobResult> {
        this.log.info({ jobId: job.id, attemptsMade: job.attemptsMade }, "processing job");

        const ctx = await this.resolve_context(job);
        if (this.is_terminal(ctx.hedge)) {
            return {
                status: "SKIPPED",
                reason: `hedge already in terminal state: ${ctx.hedge.status}`,
            };
        }

        await this.hedges.mark_hedging(ctx.hedge.id, job.attemptsMade + 1);
        if (job.attemptsMade === 0) {
            await this.exposure.increment(
                ctx.market.id,
                HedgeProcessor.notional_usd(ctx.fill.price, ctx.fill.size),
            );
        }

        return this.execute_hedge(ctx);
    }

    /**
     * Convert a fill (priceCents × shares) into whole-dollar notional. Used
     * for exposure tracking which lives in USD, not shares.
     */
    private static notional_usd(price_cents: number, shares: number): number {
        return Math.round((price_cents * shares) / 100);
    }

    private async resolve_context(job: Job<HedgeJobData>): Promise<ResolvedContext> {
        const data = job.data;
        const user = await this.lookup_user(data.event.user);
        const market = await this.lookup_market(data.event.market);
        const fill = await this.upsert_fill(data, user.id, market.id);
        const spec = this.direction.resolve({
            solanaSide: data.event.side,
            solanaOutcome: data.event.outcome,
            yesTokenId: market.yesTokenId,
            noTokenId: market.noTokenId,
        });
        const hedge = await this.upsert_hedge(fill.id, job.id!, spec, fill.size);
        return { user, market, fill, hedge, spec };
    }

    private async lookup_user(custodial_pubkey: string): Promise<CustodialUser> {
        const user = await this.users.find_by_custodial_pubkey(custodial_pubkey);
        if (!user) {
            throw new RetryableError(`no User row with custodialPublicKey=${custodial_pubkey}`);
        }
        return user;
    }

    private async lookup_market(solana_pda: string): Promise<MarketMetadata> {
        const market = await this.markets.find_by_solana_pda(solana_pda);
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
        const result = await this.fills.insert_idempotent({
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
        spec: PolymarketHedgeSpec,
        size_shares: number,
    ): Promise<HedgeRow> {
        const client_order_id = `hedger-${bull_job_id}`;
        const result = await this.hedges.create_idempotent({
            fillId: fill_id,
            bullJobId: bull_job_id,
            clientOrderId: client_order_id,
            polymarketTokenId: spec.tokenId,
            polymarketSide: spec.polymarketSide,
            requestedSize: size_shares,
        });
        return result.row;
    }

    private is_terminal(hedge: HedgeRow): boolean {
        return hedge.status === "FILLED" || hedge.status === "PARTIAL" || hedge.status === "FAILED";
    }

    private async execute_hedge(ctx: ResolvedContext): Promise<HedgeJobResult> {
        const target_price = await this.target_price_cents(ctx);
        this.announce_hedge_attempt(ctx, target_price);
        const initial = await this.orders.place_immediate({
            tokenId: ctx.spec.tokenId,
            side: ctx.spec.polymarketSide,
            sizeShares: ctx.fill.size,
            priceCents: target_price,
            tickSize: ctx.market.tickSize,
            negRisk: ctx.market.negRisk,
            clientOrderId: ctx.hedge.clientOrderId!,
        });

        if (initial.fullyFilled) {
            return this.finalize_filled(ctx, initial);
        }

        return this.finalize_partial(ctx, initial, target_price);
    }

    private announce_hedge_attempt(ctx: ResolvedContext, target_price: number): void {
        this.log.info(
            {
                marketId: ctx.market.id,
                polymarketMarketId: ctx.market.polyMarketId,
                tokenId: ctx.spec.tokenId,
                outcome: ctx.spec.outcome,
                polymarketSide: ctx.spec.polymarketSide,
                shares: ctx.fill.size,
                priceCents: target_price,
                clientOrderId: ctx.hedge.clientOrderId,
                solanaUserBought: ctx.fill.side,
            },
            ">>> HEDGE: attempting to buy/sell on Polymarket",
        );
    }

    private async target_price_cents(ctx: ResolvedContext): Promise<number> {
        const top = await this.book.fetch_top_of_book(ctx.spec.tokenId);
        if (ctx.spec.polymarketSide === "BUY") return top.bestAskCents ?? ctx.fill.price;
        return top.bestBidCents ?? ctx.fill.price;
    }

    private async finalize_filled(
        ctx: ResolvedContext,
        result: {
            polymarketOrderId: string | null;
            filledShares: number;
            avgPriceCents: number | null;
        },
    ): Promise<HedgeJobResult> {
        await this.hedges.mark_filled(
            ctx.hedge.id,
            result.polymarketOrderId ?? "unknown",
            result.filledShares,
            result.avgPriceCents ?? ctx.fill.price,
        );
        // Decrement by the original fill notional so exposure exactly cancels
        // the increment, regardless of slippage on the hedge price.
        await this.exposure.decrement(
            ctx.market.id,
            HedgeProcessor.notional_usd(ctx.fill.price, result.filledShares),
        );
        return {
            status: "FILLED",
            filledSize: result.filledShares,
            avgPriceCents: result.avgPriceCents ?? undefined,
            polymarketOrderId: result.polymarketOrderId ?? undefined,
        };
    }

    private async finalize_partial(
        ctx: ResolvedContext,
        initial: {
            polymarketOrderId: string | null;
            filledShares: number;
            avgPriceCents: number | null;
        },
        target_price: number,
    ): Promise<HedgeJobResult> {
        const remaining = ctx.fill.size - initial.filledShares;
        const walk = await this.walker.execute({
            tokenId: ctx.spec.tokenId,
            side: ctx.spec.polymarketSide,
            remainingShares: remaining,
            initialPriceCents: this.next_price(ctx.spec.polymarketSide, target_price),
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
            await this.hedges.mark_filled(
                ctx.hedge.id,
                walk.lastOrderId ?? initial.polymarketOrderId ?? "unknown",
                total_filled,
                avg ?? ctx.fill.price,
            );
            await this.exposure.decrement(
                ctx.market.id,
                HedgeProcessor.notional_usd(ctx.fill.price, total_filled),
            );
            return { status: "FILLED", filledSize: total_filled, avgPriceCents: avg ?? undefined };
        }

        await this.hedges.mark_partial(
            ctx.hedge.id,
            walk.lastOrderId ?? initial.polymarketOrderId,
            total_filled,
            avg,
        );
        if (total_filled > 0) {
            await this.exposure.decrement(
                ctx.market.id,
                HedgeProcessor.notional_usd(ctx.fill.price, total_filled),
            );
        }
        await this.events.record_alert("processor", "hedge partial — slippage cap reached", {
            hedgeId: ctx.hedge.id,
            requested: ctx.fill.size,
            filled: total_filled,
        });
        return {
            status: "PARTIAL",
            filledSize: total_filled,
            avgPriceCents: avg ?? undefined,
            reason: "slippage cap reached",
        };
    }

    private next_price(side: Side, current: number): number {
        return side === "BUY" ? current + 1 : current - 1;
    }

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

    private side_from(raw: number): Side {
        return raw === 0 ? "BUY" : "SELL";
    }

    private outcome_from(raw: number): Outcome {
        return raw === 0 ? "YES" : "NO";
    }
}
