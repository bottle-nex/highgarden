import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { prisma } from "@solmarket/database";
import ResponseWriter from "../../services/service.response";
import { ENV } from "../../config/config.env";
import { services } from "../../index";
import QuoteSignerService from "../../services/service.quote-signer";
import ExposureReaderService from "../../services/service.exposure-reader";
import PreTradeValidator from "../../services/service.pre-trade-validator";

const body_schema = z.object({
    side: z.enum(["BUY", "SELL"]),
    outcome: z.enum(["YES", "NO"]),
    size: z.coerce.number().int().positive(),
});

interface ResolvedMarket {
    id: string;
    solanaMarketPda: string;
    yesTokenId: string;
    noTokenId: string;
    polyMarketId: string;
}

export default class QuoteController {
    private static signer = new QuoteSignerService();
    private static exposure = new ExposureReaderService();
    private static pre_trade = new PreTradeValidator();

    static async process(req: Request, res: Response) {
        if (!req.user) return ResponseWriter.not_authorized(res);
        const market_id = typeof req.params.id === "string" ? req.params.id : "";
        if (!market_id) return ResponseWriter.invalid_data(res, "market id required");

        const parsed = body_schema.safeParse(req.body ?? {});
        if (!parsed.success) {
            return ResponseWriter.invalid_data(res, "Invalid quote payload");
        }

        try {
            const resolved = await QuoteController.resolve_market(market_id);
            if ("error" in resolved) return resolved.error(res);

            const price = QuoteController.compute_price(resolved.market, parsed.data);
            const notional_usd = (price * parsed.data.size) / 100;

            const verdict = await QuoteController.exposure.can_quote(
                market_id,
                notional_usd,
                parsed.data.side,
            );
            if (!verdict.ok) {
                return ResponseWriter.error(
                    res,
                    verdict.reason,
                    verdict.reason === "PAUSED" ? "market is paused" : "unhedged delta cap reached",
                    undefined,
                    429,
                );
            }

            const token_id =
                parsed.data.outcome === "YES"
                    ? resolved.market.yesTokenId
                    : resolved.market.noTokenId;

            const top = services.book_cache.getTopOfBook(token_id);
            const raw_price = parsed.data.side === "BUY" ? top?.bestAsk : top?.bestBid;
            const polymarket_notional_usd =
                raw_price && raw_price > 0 ? raw_price * parsed.data.size : 0;

            // Pre-trade validation: market still open on Polymarket, hedge
            // notional clears the $1 Polymarket minimum, and (for BUY only)
            // hedger has enough pUSD. Cached for 30s.
            const pre_check = await QuoteController.pre_trade.validate({
                polymarketMarketId: resolved.market.polyMarketId,
                side: parsed.data.side,
                estimatedHedgeCostUsd: notional_usd,
                polymarketNotionalUsd: polymarket_notional_usd,
            });
            if (!pre_check.ok) {
                return ResponseWriter.error(res, pre_check.code, pre_check.details, undefined, 409);
            }

            const signed = await QuoteController.sign_and_persist(
                resolved.market,
                parsed.data,
                price,
            );
            return ResponseWriter.success(res, signed, "Quote signed");
        } catch (err) {
            console.error("[markets/quote]", err);
            return ResponseWriter.system_error(res);
        }
    }

    private static async resolve_market(
        market_id: string,
    ): Promise<{ market: ResolvedMarket } | { error: (_res: Response) => void }> {
        const row = await prisma.market.findUnique({
            where: { id: market_id },
            include: { polymarket: true, listing: true },
        });
        if (!row) {
            return { error: (res) => ResponseWriter.not_found(res, "market not found") };
        }
        if (!row.solanaMarketPda) {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "MARKET_NOT_LISTED_ON_SOLANA",
                        "market has no on-chain PDA — approve via Approve + List on Solana first",
                        undefined,
                        409,
                    ),
            };
        }
        if (!row.polymarket) {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "MARKET_INCOMPLETE",
                        "market missing polymarket linkage",
                        undefined,
                        422,
                    ),
            };
        }
        if (row.listing && row.listing.status !== "APPROVED") {
            return {
                error: (res) =>
                    ResponseWriter.error(
                        res,
                        "MARKET_NOT_APPROVED",
                        `listing is ${row.listing!.status}`,
                        undefined,
                        409,
                    ),
            };
        }
        return {
            market: {
                id: row.id,
                solanaMarketPda: row.solanaMarketPda,
                yesTokenId: row.polymarket.yesTokenId,
                noTokenId: row.polymarket.noTokenId,
                polyMarketId: row.polyMarketId,
            },
        };
    }

    private static compute_price(
        market: ResolvedMarket,
        body: { side: "BUY" | "SELL"; outcome: "YES" | "NO" },
    ): number {
        const token_id = body.outcome === "YES" ? market.yesTokenId : market.noTokenId;
        const top = services.book_cache.getTopOfBook(token_id);
        const fallback = body.side === "BUY" ? 51 : 49;
        if (!top) return fallback;

        const spread = ENV.SERVER_QUOTE_SPREAD_CENTS;
        const ask_cents = top.bestAsk !== null ? Math.round(top.bestAsk * 100) : null;
        const bid_cents = top.bestBid !== null ? Math.round(top.bestBid * 100) : null;
        if (body.side === "BUY") {
            return Math.min(99, (ask_cents ?? fallback) + spread);
        }
        return Math.max(1, (bid_cents ?? fallback) - spread);
    }

    private static async sign_and_persist(
        market: ResolvedMarket,
        body: { side: "BUY" | "SELL"; outcome: "YES" | "NO"; size: number },
        price_cents: number,
    ) {
        if (!QuoteController.signer.is_configured()) {
            throw new Error("SERVER_QUOTE_SIGNER_KEYPAIR is not configured");
        }
        const nonce = randomBytes(16);
        const expires_at = Math.floor(Date.now() / 1000) + ENV.SERVER_QUOTE_EXPIRY_SECONDS;
        const side = body.side === "BUY" ? 0 : 1;
        const outcome = body.outcome === "YES" ? 0 : 1;

        const signed = QuoteController.signer.sign({
            market: new PublicKey(market.solanaMarketPda),
            side: side as 0 | 1,
            outcome: outcome as 0 | 1,
            priceCents: price_cents,
            sizeShares: body.size,
            expiresAt: expires_at,
            nonce,
        });

        await prisma.quote.create({
            data: {
                nonce: signed.nonceHex,
                marketId: market.id,
                side: body.side,
                outcome: body.outcome,
                price: price_cents,
                size: body.size,
                expiresAt: new Date(expires_at * 1000),
                signature: signed.signatureBase64,
                consumed: false,
            },
        });

        return signed;
    }
}
