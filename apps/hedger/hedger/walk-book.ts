import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";
import PolymarketOrderService, { type PlaceMarketOrderResult } from "../polymarket/orders";
import type { Side } from "@solmarket/database";

export interface WalkBookInput {
    tokenId: string;
    side: Side;
    remainingShares: number;
    initialPriceCents: number;
    tickSize: string;
    negRisk: boolean;
    clientOrderIdBase: string;
}

export interface WalkBookOutput {
    totalFilledShares: number;
    weightedAvgPriceCents: number | null;
    lastOrderId: string | null;
    slippageBudgetExhausted: boolean;
    attempts: number;
}

export default class WalkBookExecutor {
    private readonly log = LoggerFactory.for_category("walk-book");
    private readonly orders: PolymarketOrderService;

    constructor(orders: PolymarketOrderService) {
        this.orders = orders;
    }

    public async execute(input: WalkBookInput): Promise<WalkBookOutput> {
        const accumulator = this.empty_accumulator();
        await this.run_loop(input, accumulator);
        return this.finalize_accumulator(accumulator);
    }

    private empty_accumulator() {
        return {
            filled: 0,
            usdc_paid: 0,
            attempts: 0,
            last_order_id: null as string | null,
            budget_exhausted: false,
        };
    }

    private async run_loop(
        input: WalkBookInput,
        acc: ReturnType<WalkBookExecutor["empty_accumulator"]>,
    ): Promise<void> {
        const max_price = this.max_price_cents(input);
        let current_price = input.initialPriceCents;

        while (acc.filled < input.remainingShares) {
            if (this.price_outside_budget(input.side, current_price, max_price)) {
                acc.budget_exhausted = true;
                this.log.warn(
                    { current_price, max_price, side: input.side },
                    "slippage budget exhausted",
                );
                return;
            }

            const remaining = input.remainingShares - acc.filled;
            acc.attempts += 1;
            const result = await this.orders.place_immediate({
                tokenId: input.tokenId,
                side: input.side,
                sizeShares: remaining,
                priceCents: current_price,
                tickSize: input.tickSize,
                negRisk: input.negRisk,
                clientOrderId: `${input.clientOrderIdBase}-walk-${acc.attempts}`,
            });

            this.merge_result(acc, result);
            if (result.fullyFilled || result.filledShares === remaining) return;
            if (result.filledShares === 0) {
                acc.budget_exhausted = true;
                this.log.warn({ current_price }, "step returned 0 fills, stopping walk");
                return;
            }
            current_price = this.advance_price(input.side, current_price);
        }
    }

    private merge_result(
        acc: ReturnType<WalkBookExecutor["empty_accumulator"]>,
        result: PlaceMarketOrderResult,
    ): void {
        acc.filled += result.filledShares;
        if (result.avgPriceCents !== null) {
            acc.usdc_paid += result.filledShares * result.avgPriceCents;
        }
        if (result.polymarketOrderId) acc.last_order_id = result.polymarketOrderId;
    }

    private finalize_accumulator(
        acc: ReturnType<WalkBookExecutor["empty_accumulator"]>,
    ): WalkBookOutput {
        const avg = acc.filled > 0 ? Math.round(acc.usdc_paid / acc.filled) : null;
        return {
            totalFilledShares: acc.filled,
            weightedAvgPriceCents: avg,
            lastOrderId: acc.last_order_id,
            slippageBudgetExhausted: acc.budget_exhausted,
            attempts: acc.attempts,
        };
    }

    private max_price_cents(input: WalkBookInput): number {
        const cap = ENV.HEDGER_SLIPPAGE_LIMIT_CENTS;
        return input.side === "BUY" ? input.initialPriceCents + cap : input.initialPriceCents - cap;
    }

    private price_outside_budget(side: Side, current: number, max: number): boolean {
        return side === "BUY" ? current > max : current < max;
    }

    private advance_price(side: Side, current: number): number {
        return side === "BUY" ? current + 1 : current - 1;
    }
}
