import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "@solmarket/database";
import type { Outcome, Side } from "@solmarket/database";
import type { PlaceMarketOrderResult } from "@solmarket/polymarket-client";
import { ENV } from "../config/config.env";
import ServerPolymarketClientFactory from "./service.polymarket-client";
import QuoteSignerService from "./service.quote-signer";
import SolanaTradeService from "./service.solana-trade";
import InventoryNetterService, {
    type NettedConsumption,
} from "./service.inventory-netter";

// ───────────────────────────── Types ─────────────────────────────

export interface TradeRequest {
    userId: string;
    marketDbId: string;
    side: Side;
    outcome: Outcome;
    sizeShares: number;
    /** Optional client-supplied UUID. Generated if absent. */
    requestId?: string;
}

export interface TradeResult {
    txSignature: string;
    polymarketOrderId: string;
    filledShares: number;
    pricePaidCents: number;
    totalUsd: number;
    requestId: string;
    /** True when Polymarket inventory was netted and no fresh order was placed. */
    nettedFromInventory: boolean;
}

export type TradeErrorCode =
    | "MARKET_NOT_FOUND"
    | "MARKET_NOT_LISTED_ON_SOLANA"
    | "MARKET_PAUSED"
    | "MARKET_RESOLVED"
    | "STALE_BOOK"
    | "TRADE_UNAVAILABLE"
    | "MARKET_CLOSED_ON_POLYMARKET"
    | "TRADE_RECONCILE_PENDING";

export class TradeError extends Error {
    public readonly code: TradeErrorCode;
    public readonly status: number;
    constructor(code: TradeErrorCode, status: number, message: string) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = "TradeError";
    }
}

interface ResolvedMarket {
    id: string;
    solanaMarketPda: string;
    yesTokenId: string;
    noTokenId: string;
    tickSize: string;
    negRisk: boolean;
    polymarketSide: Side;
    outcome: Outcome;
    tokenId: string;
}

interface HedgeFilledShape {
    polymarketOrderId: string;
    filledShares: number;
    avgPriceCents: number;
    nettedFromInventory: boolean;
    nettedInventoryIds: string[];
}

// ───────────────────────────── Service ─────────────────────────────

/**
 * Hedge-first orchestration. The single entry point is {@link execute}; the
 * private methods walk the seven plan-document steps in order:
 *
 *   1. validate         — market lookup + status checks
 *   2. resolve_polymarket_target — pick token + side from outcome+intent
 *   3. attempt_netting  — consume PlatformInventory if matching rows exist
 *   4. fill_via_polymarket — place FAK order for any uncovered shares
 *   5. derive_user_price — apply spread to the actual fill (not a quote)
 *   6. sign_quote_internally — ed25519-sign with quote-signer key
 *   7. submit_solana    — call SolanaTradeService; on permanent failure,
 *                         record PlatformInventory and surface a
 *                         RECONCILE_PENDING error
 *
 * Each method does at most one or two heavy units of work and is named for
 * the step it owns so a future debugger can match the log timeline to the
 * source.
 */
export default class TradeOrchestratorService {
    private readonly netter = new InventoryNetterService();
    private readonly signer = new QuoteSignerService();
    private readonly solana = new SolanaTradeService();

    public async execute(req: TradeRequest): Promise<TradeResult> {
        const request_id = req.requestId ?? randomUUID();
        const market = await this.validate(req.marketDbId, req.side, req.outcome);
        const netting = await this.attempt_netting(market, req.sizeShares);
        const polymarket_fill = await this.fill_via_polymarket(market, netting, req.sizeShares);
        const hedge = this.combine_hedge_legs(netting, polymarket_fill);

        const user_price_cents = this.derive_user_price(hedge.avgPriceCents, req.side);
        const nonce = this.derive_nonce(request_id);
        const signed = this.sign_quote_internally({
            market_pda: market.solanaMarketPda,
            side: req.side,
            outcome: req.outcome,
            price_cents: user_price_cents,
            size_shares: hedge.filledShares,
            nonce,
        });

        const solana_result = await this.submit_solana_or_record_inventory(
            req,
            market,
            signed,
            hedge,
        );

        return {
            txSignature: solana_result.txSignature,
            polymarketOrderId: hedge.polymarketOrderId,
            filledShares: hedge.filledShares,
            pricePaidCents: user_price_cents,
            totalUsd: this.compute_total_usd(hedge.filledShares, user_price_cents),
            requestId: request_id,
            nettedFromInventory: hedge.nettedFromInventory,
        };
    }

    // ───────────────── Step 1: validate ─────────────────

    private async validate(
        market_db_id: string,
        side: Side,
        outcome: Outcome,
    ): Promise<ResolvedMarket> {
        const row = await prisma.market.findUnique({
            where: { id: market_db_id },
            include: { polymarket: true, listing: true, exposure: true },
        });
        if (!row) throw new TradeError("MARKET_NOT_FOUND", 409, "market not found");
        if (!row.solanaMarketPda) {
            throw new TradeError(
                "MARKET_NOT_LISTED_ON_SOLANA",
                409,
                "market has no on-chain PDA — approve it via Approve + List on Solana first",
            );
        }
        if (row.status === "PAUSED" || row.exposure?.paused) {
            throw new TradeError("MARKET_PAUSED", 409, "market is paused");
        }
        if (row.status === "RESOLVED") {
            throw new TradeError(
                "MARKET_RESOLVED",
                409,
                "market is already resolved — no more trades",
            );
        }
        if (!row.polymarket) {
            throw new TradeError(
                "MARKET_NOT_FOUND",
                422,
                "market missing polymarket linkage",
            );
        }

        return this.shape_market(row, side, outcome);
    }

    private shape_market(
        row: {
            id: string;
            solanaMarketPda: string | null;
            polymarket: {
                yesTokenId: string;
                noTokenId: string;
                tickSize: string;
                negRisk: boolean;
            } | null;
        },
        side: Side,
        outcome: Outcome,
    ): ResolvedMarket {
        const poly = row.polymarket!;
        const tokenId = outcome === "YES" ? poly.yesTokenId : poly.noTokenId;
        // Polymarket-side intent mirrors the user's solmarket-side intent:
        // user BUYs YES on solmarket → we BUY YES on Polymarket.
        const polymarketSide: Side = side;
        return {
            id: row.id,
            solanaMarketPda: row.solanaMarketPda!,
            yesTokenId: poly.yesTokenId,
            noTokenId: poly.noTokenId,
            tickSize: poly.tickSize,
            negRisk: poly.negRisk,
            polymarketSide,
            outcome,
            tokenId,
        };
    }

    // ───────────────── Step 3: attempt netting ─────────────────

    private async attempt_netting(market: ResolvedMarket, shares: number) {
        return this.netter.net({
            marketId: market.id,
            polymarketSide: market.polymarketSide,
            outcome: market.outcome,
            sharesNeeded: shares,
        }).catch(() => ({ consumed: [], totalSharesNetted: 0, remainingShares: shares }));
    }

    // ───────────────── Step 4: place Polymarket order ─────────────────

    private async fill_via_polymarket(
        market: ResolvedMarket,
        netting: { remainingShares: number },
        original_shares: number,
    ): Promise<PlaceMarketOrderResult | null> {
        if (netting.remainingShares <= 0) return null;
        const poly = ServerPolymarketClientFactory.get();
        const top = await poly.get_top_of_book(market.tokenId);
        const target_price = this.pick_target_price(top, market.polymarketSide);
        if (target_price === null) {
            throw new TradeError("STALE_BOOK", 503, "polymarket book unavailable");
        }
        const client_order_id = `server-${randomUUID()}`;
        try {
            const result = await this.race_with_timeout(
                poly.place_market_order({
                    tokenId: market.tokenId,
                    side: market.polymarketSide,
                    sizeShares: netting.remainingShares,
                    priceCents: target_price,
                    tickSize: market.tickSize,
                    negRisk: market.negRisk,
                    clientOrderId: client_order_id,
                }),
                ENV.SERVER_TRADE_HEDGE_TIMEOUT_MS,
            );
            this.assert_filled(result, original_shares, netting.remainingShares);
            return result;
        } catch (err) {
            if (err instanceof TradeError) throw err;
            throw new TradeError(
                "TRADE_UNAVAILABLE",
                503,
                `polymarket fill failed: ${(err as Error).message}`,
            );
        }
    }

    private pick_target_price(
        top: { bestAskCents: number | null; bestBidCents: number | null },
        side: Side,
    ): number | null {
        if (side === "BUY") return top.bestAskCents;
        return top.bestBidCents;
    }

    private assert_filled(
        result: PlaceMarketOrderResult,
        original_shares: number,
        remaining: number,
    ): void {
        if (result.filledShares <= 0) {
            throw new TradeError(
                "TRADE_UNAVAILABLE",
                503,
                `polymarket filled 0 of ${remaining} shares (request was ${original_shares})`,
            );
        }
    }

    private async race_with_timeout<T>(p: Promise<T>, ms: number): Promise<T> {
        return await Promise.race([
            p,
            new Promise<T>((_, reject) =>
                setTimeout(
                    () => reject(new Error(`polymarket call exceeded ${ms}ms`)),
                    ms,
                ),
            ),
        ]);
    }

    // ───────────────── Combine netting + Polymarket legs ─────────────────

    private combine_hedge_legs(
        netting: { consumed: NettedConsumption[]; totalSharesNetted: number },
        polymarket: PlaceMarketOrderResult | null,
    ): HedgeFilledShape {
        const netted_shares = netting.totalSharesNetted;
        const polymarket_shares = polymarket?.filledShares ?? 0;
        const total_shares = netted_shares + polymarket_shares;

        const netted_avg = this.weighted_avg(netting.consumed);
        const polymarket_avg = polymarket?.avgPriceCents ?? null;
        const combined_avg = this.merge_avg(
            netted_shares,
            netted_avg,
            polymarket_shares,
            polymarket_avg,
        );

        return {
            polymarketOrderId:
                polymarket?.polymarketOrderId ??
                netting.consumed[0]?.polymarketOrderId ??
                "netted",
            filledShares: total_shares,
            avgPriceCents: combined_avg,
            nettedFromInventory: netted_shares > 0,
            nettedInventoryIds: netting.consumed.map((c) => c.inventoryId),
        };
    }

    private weighted_avg(consumed: NettedConsumption[]): number | null {
        if (consumed.length === 0) return null;
        let total_shares = 0;
        let total_usdc_cents = 0;
        for (const c of consumed) {
            total_shares += c.sharesConsumed;
            total_usdc_cents += c.sharesConsumed * c.avgPriceCents;
        }
        return total_shares > 0 ? Math.round(total_usdc_cents / total_shares) : null;
    }

    private merge_avg(
        a_shares: number,
        a_avg: number | null,
        b_shares: number,
        b_avg: number | null,
    ): number {
        const total = a_shares + b_shares;
        if (total === 0) return 50; // last-resort default; assert_filled guards above
        const a_total = (a_avg ?? 0) * a_shares;
        const b_total = (b_avg ?? 0) * b_shares;
        return Math.round((a_total + b_total) / total);
    }

    // ───────────────── Step 5: derive user price ─────────────────

    private derive_user_price(hedge_avg_cents: number, side: Side): number {
        const spread = ENV.SERVER_QUOTE_SPREAD_CENTS;
        // BUY: user pays MORE than the platform paid on Polymarket.
        // SELL: user receives LESS than the platform received.
        const raw = side === "BUY" ? hedge_avg_cents + spread : hedge_avg_cents - spread;
        return this.clamp_cents(raw);
    }

    private clamp_cents(cents: number): number {
        if (cents < 1) return 1;
        if (cents > 99) return 99;
        return cents;
    }

    // ───────────────── Step 6: sign quote internally ─────────────────

    private sign_quote_internally(args: {
        market_pda: string;
        side: Side;
        outcome: Outcome;
        price_cents: number;
        size_shares: number;
        nonce: Buffer;
    }) {
        const expires_at = Math.floor(Date.now() / 1000) + ENV.SERVER_QUOTE_EXPIRY_SECONDS;
        return this.signer.sign({
            market: new PublicKey(args.market_pda),
            side: args.side === "BUY" ? 0 : 1,
            outcome: args.outcome === "YES" ? 0 : 1,
            priceCents: args.price_cents,
            sizeShares: args.size_shares,
            expiresAt: expires_at,
            nonce: args.nonce,
        });
    }

    /** Deterministic 16-byte nonce from the request_id so the same retry
     *  produces the same Solana UsedNonce PDA — third layer of idempotency.
     *  If requestId is absent, randomBytes guarantees uniqueness across
     *  concurrent calls. */
    private derive_nonce(request_id: string): Buffer {
        if (!request_id) return randomBytes(16);
        return createHash("sha256").update(request_id).digest().subarray(0, 16);
    }

    // ───────────────── Step 7: submit Solana ─────────────────

    private async submit_solana_or_record_inventory(
        req: TradeRequest,
        market: ResolvedMarket,
        signed: ReturnType<QuoteSignerService["sign"]>,
        hedge: HedgeFilledShape,
    ): Promise<{ txSignature: string }> {
        try {
            const result = await this.solana.place_order({
                userId: req.userId,
                marketDbId: req.marketDbId,
                signedQuote: signed,
            });
            await this.link_consumed_inventory(hedge, result.txSignature);
            return { txSignature: result.txSignature };
        } catch (err) {
            await this.record_orphan_inventory(market, hedge, err);
            throw new TradeError(
                "TRADE_RECONCILE_PENDING",
                500,
                `solana submit failed after polymarket fill: ${(err as Error).message}`,
            );
        }
    }

    private async link_consumed_inventory(
        hedge: HedgeFilledShape,
        tx_signature: string,
    ): Promise<void> {
        if (hedge.nettedInventoryIds.length === 0) return;
        const fill = await prisma.fill.findUnique({
            where: { solanaTxSig: tx_signature },
            select: { id: true },
        });
        if (!fill) return;
        await this.netter.link_to_fill(hedge.nettedInventoryIds, fill.id);
    }

    /**
     * Polymarket leg succeeded but Solana commit failed permanently —
     * record the orphan position so the liquidator/netter can reuse it
     * later. This is the bounded-risk corner-case from the design plan.
     */
    private async record_orphan_inventory(
        market: ResolvedMarket,
        hedge: HedgeFilledShape,
        err: unknown,
    ): Promise<void> {
        // Don't record if everything came from netting — there's nothing new
        // sitting on Polymarket; the netted rows were already on-platform.
        if (!hedge.nettedFromInventory && hedge.polymarketOrderId === "netted") return;
        if (hedge.polymarketOrderId === "netted") return;
        try {
            await prisma.platformInventory.create({
                data: {
                    marketId: market.id,
                    polymarketOrderId: hedge.polymarketOrderId,
                    polymarketTokenId: market.tokenId,
                    side: market.polymarketSide,
                    outcome: market.outcome,
                    shares: hedge.filledShares,
                    avgPriceCents: hedge.avgPriceCents,
                    reason: "SOLANA_FAILED_AFTER_HEDGE",
                    notes: (err as Error).message?.slice(0, 500) ?? null,
                },
            });
        } catch (record_err) {
            console.error("[trade-orchestrator] failed to record platform inventory", record_err);
        }
    }

    private compute_total_usd(filled_shares: number, price_cents: number): number {
        return Math.round(filled_shares * price_cents) / 100;
    }
}
