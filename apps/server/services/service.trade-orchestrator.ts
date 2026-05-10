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

    /**
     * TEST-ONLY shortcut: build a signed quote at a fixed test price,
     * sign it with the quote signer, submit place_order on Solana, and
     * return. NO Polymarket call, NO inventory netting, NO Quote / Fill /
     * Hedge persistence (SolanaTradeService.place_order writes its own
     * Fill row internally — that one stays so the portfolio reflects the
     * test trade).
     *
     * Used by the temporary `execute_trade_skip_polymarket` path on
     * TradeController to smoke-test the on-chain contract end-to-end
     * without depending on Polymarket connectivity / credentials.
     *
     * REMOVE BEFORE PROD: this method bypasses the spread, the inventory
     * accounting, and the orphan-recording safety net. Calling it in
     * production silently leaks platform exposure.
     */
    public async execute_solana_only(req: TradeRequest): Promise<TradeResult> {
        const TEST_PRICE_CENTS = 50;
        const request_id = req.requestId ?? randomUUID();
        const market = await this.validate(req.marketDbId, req.side, req.outcome);
        const nonce = this.derive_nonce(request_id);
        const expires_at_unix = Math.floor(Date.now() / 1000) + ENV.SERVER_QUOTE_EXPIRY_SECONDS;
        const signed = this.sign_quote_internally({
            market_pda: market.solanaMarketPda,
            side: req.side,
            outcome: req.outcome,
            price_cents: TEST_PRICE_CENTS,
            size_shares: req.sizeShares,
            nonce,
            expires_at_unix,
        });
        const solana_result = await this.solana.place_order({
            userId: req.userId,
            marketDbId: req.marketDbId,
            signedQuote: signed,
        });
        return {
            txSignature: solana_result.txSignature,
            polymarketOrderId: "skipped-polymarket",
            filledShares: req.sizeShares,
            pricePaidCents: TEST_PRICE_CENTS,
            totalUsd: this.compute_total_usd(req.sizeShares, TEST_PRICE_CENTS),
            requestId: request_id,
            nettedFromInventory: false,
        };
    }

    public async execute(req: TradeRequest): Promise<TradeResult> {
        const request_id = req.requestId ?? randomUUID();
        const market = await this.validate(req.marketDbId, req.side, req.outcome);
        const netting = await this.attempt_netting(market, req.sizeShares);
        const polymarket_fill = await this.fill_via_polymarket(market, netting, req.sizeShares);
        const hedge = this.combine_hedge_legs(netting, polymarket_fill);

        const user_price_cents = this.derive_user_price(hedge.avgPriceCents, req.side);
        const nonce = this.derive_nonce(request_id);
        const expires_at_unix = Math.floor(Date.now() / 1000) + ENV.SERVER_QUOTE_EXPIRY_SECONDS;
        const signed = this.sign_quote_internally({
            market_pda: market.solanaMarketPda,
            side: req.side,
            outcome: req.outcome,
            price_cents: user_price_cents,
            size_shares: hedge.filledShares,
            nonce,
            expires_at_unix,
        });

        // Persist the signed quote BEFORE submitting on-chain. Audit trail
        // for the signer (anomaly detection later); the nonce sweeper
        // relies on this row to know which UsedNonce PDAs to reclaim rent
        // from after the quote expires.
        await this.persist_quote(market.id, req, user_price_cents, hedge.filledShares, signed, expires_at_unix);

        const solana_result = await this.submit_solana_or_record_inventory(
            req,
            market,
            signed,
            hedge,
        );

        // Mark the quote consumed so the sweeper picks it up and closes
        // the on-chain UsedNonce PDA after expiry. Best-effort; a failure
        // here is non-fatal — the sweeper falls back to expiry-only logic
        // and the user's trade has already succeeded.
        await this.mark_quote_consumed(signed.nonceHex);

        // Pre-write Fill + Hedge in FILLED status. Critical for hedge-first:
        // without this, the hedger's catch-up poller picks up the
        // OrderFilled event ~10s later, sees no existing Hedge, and tries
        // to place a SECOND Polymarket order. Pre-writing in FILLED state
        // makes `is_terminal()` return true on the hedger side and the
        // processor returns SKIPPED. Best-effort — if this throws, the
        // hedger's poller will create the rows itself (with a duplicate
        // Polymarket order in live mode), which is the bug we're avoiding
        // here but it's recoverable via the inventory-netter on the next
        // opposite-direction trade.
        await this.persist_fill_and_hedge(
            req,
            market,
            signed,
            hedge,
            user_price_cents,
            solana_result.txSignature,
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
        expires_at_unix: number;
    }) {
        return this.signer.sign({
            market: new PublicKey(args.market_pda),
            side: args.side === "BUY" ? 0 : 1,
            outcome: args.outcome === "YES" ? 0 : 1,
            priceCents: args.price_cents,
            sizeShares: args.size_shares,
            expiresAt: args.expires_at_unix,
            nonce: args.nonce,
        });
    }

    /**
     * Audit-log every signed quote into the Quote table. Idempotent on the
     * nonce primary key — if the same requestId hashes to the same nonce
     * (the deterministic-nonce-from-requestId path), we no-op rather than
     * fail. The signature is preserved for forensics in case the quote
     * signer key is ever suspected of being compromised.
     */
    private async persist_quote(
        market_db_id: string,
        req: TradeRequest,
        price_cents: number,
        size_shares: number,
        signed: ReturnType<QuoteSignerService["sign"]>,
        expires_at_unix: number,
    ): Promise<void> {
        try {
            await prisma.quote.create({
                data: {
                    nonce: signed.nonceHex,
                    marketId: market_db_id,
                    side: req.side,
                    outcome: req.outcome,
                    price: price_cents,
                    size: size_shares,
                    expiresAt: new Date(expires_at_unix * 1000),
                    signature: signed.signatureBase64,
                    consumed: false,
                },
            });
        } catch (err) {
            // P2002 = unique constraint on nonce. Means the same requestId
            // (or a colliding nonce) was already audited — safe no-op.
            if ((err as { code?: string }).code === "P2002") return;
            // Any other error is unexpected; surface it so the orchestrator
            // bails before submitting on-chain. Better to fail the whole
            // trade than have an on-chain Fill without an audit row.
            throw err;
        }
    }

    /**
     * Flip Quote.consumed to true after the on-chain place_order has
     * landed. The nonce sweeper queries `consumed = true AND nonceClosedAt
     * IS NULL` to find PDAs ready to close. Failure is logged but does not
     * roll back the trade — the worst case is the sweeper relies on
     * expiry-time-based fallback logic instead.
     */
    private async mark_quote_consumed(nonce_hex: string): Promise<void> {
        try {
            await prisma.quote.update({
                where: { nonce: nonce_hex },
                data: { consumed: true },
            });
        } catch (err) {
            console.warn(
                "[trade-orchestrator] mark_quote_consumed failed (non-fatal)",
                (err as Error)?.message ?? err,
            );
        }
    }

    /**
     * Pre-write Fill + Hedge rows in FILLED status. The hedger's catch-up
     * poller picks up the on-chain `OrderFilled` event ~10s after this
     * runs; with these rows already present, its `is_terminal()` check
     * returns true and the processor returns SKIPPED — no duplicate
     * Polymarket order.
     *
     * Idempotency: each row's unique key is enforced. `Fill.solanaTxSig`
     * (unique) and `Fill.nonce` (unique) prevent duplicate Fill inserts on
     * retry; `Hedge.fillId` (unique 1:1) prevents duplicate Hedge.
     * `Hedge.bullJobId` is set to nonceHex so when the hedger does call
     * `queue.add({ jobId: nonceHex })`, BullMQ's dedupe rejects the
     * duplicate at the queue layer too — belt and suspenders.
     */
    private async persist_fill_and_hedge(
        req: TradeRequest,
        market: ResolvedMarket,
        signed: ReturnType<QuoteSignerService["sign"]>,
        hedge: HedgeFilledShape,
        price_cents: number,
        tx_signature: string,
    ): Promise<void> {
        try {
            await prisma.$transaction(async (tx) => {
                const fill = await tx.fill.create({
                    data: {
                        userId: req.userId,
                        marketId: market.id,
                        side: req.side,
                        outcome: req.outcome,
                        price: price_cents,
                        size: hedge.filledShares,
                        solanaTxSig: tx_signature,
                        nonce: signed.nonceHex,
                        // 1:1 link to consumed inventory (orchestrator
                        // schema only allows ONE per Fill — additional
                        // consumed rows still have nettedAt set and live
                        // in PlatformInventory's nettedAt index).
                        nettedFromInventoryId: hedge.nettedInventoryIds[0] ?? null,
                    },
                });
                await tx.hedge.create({
                    data: {
                        fillId: fill.id,
                        polymarketOrderId: hedge.polymarketOrderId,
                        polymarketTokenId: market.tokenId,
                        polymarketSide: market.polymarketSide,
                        bullJobId: signed.nonceHex,
                        clientOrderId: hedge.nettedFromInventory ? null : `server-${signed.nonceHex}`,
                        requestedSize: hedge.filledShares,
                        filledSize: hedge.filledShares,
                        avgPrice: hedge.avgPriceCents,
                        status: "FILLED",
                        completedAt: new Date(),
                    },
                });
            });
        } catch (err) {
            // P2002 = unique constraint hit. Either the hedger's poller
            // already processed this OrderFilled event (raced us) or the
            // request_id was retried after a partial commit. Either way,
            // the row(s) already exist — safe to ignore.
            const code = (err as { code?: string }).code;
            if (code === "P2002") return;
            // Anything else is unexpected; log loudly but don't throw —
            // the trade has already succeeded on-chain. The hedger's
            // poller is the fallback writer.
            console.error(
                "[trade-orchestrator] persist_fill_and_hedge failed (non-fatal — hedger will fall back)",
                err,
            );
        }
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
            // Note: inventory linking happens inline inside
            // persist_fill_and_hedge() now (Fix B). The Fill row is created
            // there with `nettedFromInventoryId` set directly, so no
            // separate post-write linking step is needed.
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
