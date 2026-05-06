import { OrderType, Side as PolySide } from "@polymarket/clob-client-v2";
import LoggerFactory from "../log/logger";
import PolymarketClientFactory from "./client";
import type { Side as DbSide } from "@solmarket/database";
import { RetryableError, UnrecoverableError } from "../errors";

export interface PlaceMarketOrderInput {
    tokenId: string;
    side: DbSide;
    sizeShares: number;
    priceCents: number;
    tickSize: string;
    negRisk: boolean;
    clientOrderId: string;
}

export interface PlaceMarketOrderResult {
    polymarketOrderId: string | null;
    filledShares: number;
    avgPriceCents: number | null;
    fullyFilled: boolean;
    raw?: unknown;
}

export default class PolymarketOrderService {
    private readonly log = LoggerFactory.for_category("polymarket-orders");

    public async place_immediate(input: PlaceMarketOrderInput): Promise<PlaceMarketOrderResult> {
        if (PolymarketClientFactory.is_dry_run()) {
            return this.simulate_dry_run(input);
        }
        return this.place_real(input);
    }

    private simulate_dry_run(input: PlaceMarketOrderInput): PlaceMarketOrderResult {
        this.log.info(
            {
                clientOrderId: input.clientOrderId,
                tokenId: input.tokenId,
                side: input.side,
                size: input.sizeShares,
                priceCents: input.priceCents,
            },
            "DRY-RUN: would place Polymarket FAK order",
        );
        return {
            polymarketOrderId: `dryrun-${input.clientOrderId}`,
            filledShares: input.sizeShares,
            avgPriceCents: input.priceCents,
            fullyFilled: true,
        };
    }

    private async place_real(input: PlaceMarketOrderInput): Promise<PlaceMarketOrderResult> {
        const order_payload = this.build_payload(input);
        const options = this.build_options(input);

        try {
            const resp = await PolymarketClientFactory.get_client().createAndPostMarketOrder(
                order_payload,
                options,
                OrderType.FAK,
            );
            return this.interpret_response(resp, input);
        } catch (err) {
            throw this.classify_error(err);
        }
    }

    private build_payload(input: PlaceMarketOrderInput) {
        const price_decimal = input.priceCents / 100;
        const dollar_amount =
            input.side === "BUY"
                ? Math.round(input.sizeShares * price_decimal * 100) / 100
                : input.sizeShares;
        return {
            tokenID: input.tokenId,
            price: price_decimal,
            amount: dollar_amount,
            side: input.side === "BUY" ? PolySide.BUY : PolySide.SELL,
        };
    }

    private build_options(input: PlaceMarketOrderInput) {
        return {
            tickSize: input.tickSize as "0.1" | "0.01" | "0.001" | "0.0001",
            negRisk: input.negRisk,
        };
    }

    private interpret_response(
        resp: unknown,
        input: PlaceMarketOrderInput,
    ): PlaceMarketOrderResult {
        const r = resp as {
            success?: boolean;
            errorMsg?: string;
            orderID?: string;
            takingAmount?: string;
            makingAmount?: string;
            status?: string;
        };

        if (r.success === false || r.errorMsg) {
            throw new RetryableError(r.errorMsg ?? "polymarket order rejected");
        }

        this.log.debug(
            {
                side: input.side,
                priceCentsCap: input.priceCents,
                requestedShares: input.sizeShares,
                makingAmount: r.makingAmount,
                takingAmount: r.takingAmount,
                status: r.status,
                orderID: r.orderID,
            },
            "polymarket order response (raw amounts)",
        );

        const filled_shares = this.compute_filled_shares(r, input);
        const avg_price_cents = this.compute_avg_price(r, input, filled_shares);
        const fully_filled = filled_shares >= input.sizeShares;

        return {
            polymarketOrderId: r.orderID ?? null,
            filledShares: filled_shares,
            avgPriceCents: avg_price_cents,
            fullyFilled: fully_filled,
            raw: resp,
        };
    }

    // Polymarket order semantics (per @polymarket/order-utils):
    //   BUY  → maker side = USDC,   taker side = shares
    //   SELL → maker side = shares, taker side = USDC
    // The response's makingAmount/takingAmount report the FILLED portion of each
    // side, in human units (e.g. "1.0" for 1 share, "0.17" for 17¢).
    private compute_filled_shares(
        resp: { takingAmount?: string; makingAmount?: string },
        input: PlaceMarketOrderInput,
    ): number {
        const shares_str = input.side === "BUY" ? resp.takingAmount : resp.makingAmount;
        const num = Number(shares_str ?? 0);
        return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
    }

    private compute_avg_price(
        resp: { takingAmount?: string; makingAmount?: string },
        input: PlaceMarketOrderInput,
        filled_shares: number,
    ): number | null {
        if (filled_shares === 0) return null;
        const usdc_str = input.side === "BUY" ? resp.makingAmount : resp.takingAmount;
        const usdc = Number(usdc_str ?? 0);
        if (!Number.isFinite(usdc) || usdc <= 0) return input.priceCents;
        return Math.round((usdc / filled_shares) * 100);
    }

    private classify_error(err: unknown): Error {
        const msg = (err as Error)?.message ?? String(err);
        if (this.is_unrecoverable(msg)) return new UnrecoverableError(msg, err);
        return new RetryableError(msg, err);
    }

    private is_unrecoverable(msg: string): boolean {
        const lowered = msg.toLowerCase();
        return (
            lowered.includes("invalid signature") ||
            lowered.includes("not allowed") ||
            lowered.includes("forbidden") ||
            lowered.includes("invalid token") ||
            lowered.includes("blocked")
        );
    }
}
