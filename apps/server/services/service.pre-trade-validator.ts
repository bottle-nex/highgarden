import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SolmarketClient } from "@solmarket/contract";
import { prisma } from "@solmarket/database";
import type { Outcome, Side } from "@solmarket/database";
import { ENV } from "../config/config.env";
import { GammaClient } from "../polymarket/gamma";
import BalanceMonitorService from "./service.balance-monitor";
import { TradeError, type TradeErrorCode } from "./service.trade-errors";

const STATUS_TTL_MS = 30_000;
const BALANCE_TTL_MS = 30_000;

/** Worst-case BUY price assumption when book is stale. The on-chain max is 99¢. */
const BUY_PRICE_FALLBACK_CENTS = 99;
/** Extra cents added to BUY balance estimate so a small adverse tick between
 *  pre-flight and on-chain transfer doesn't fail the SPL move. */
const BUY_PRICE_BUFFER_CENTS = 2;
/** cents → micro-USDC (USDC has 6 decimals). Mirror of the on-chain constant. */
const USDC_PER_CENT = BigInt(10_000);

// Minimum pUSD we want to keep in the funder wallet at all times. Even if the
// estimated hedge cost is $5, we don't want to drain to zero — leave a buffer.
const MIN_FUNDER_BUFFER_PUSD = 5;

// Polymarket's CLOB rejects marketable orders whose notional is under $1 on
// either side. If we let such an order through, the user's Solana fill is
// real but the hedge silently fails — leaving the platform short.
const POLYMARKET_MIN_NOTIONAL_USD = 1;

export type ValidationFailure =
    | { ok: false; code: "MARKET_CLOSED_ON_POLYMARKET"; details: string }
    | { ok: false; code: "MARKET_NOT_ACCEPTING_ORDERS"; details: string }
    | { ok: false; code: "BELOW_HEDGE_MIN_NOTIONAL"; details: string }
    | { ok: false; code: "INSUFFICIENT_FUNDER_BALANCE"; details: string };

export type ValidationResult = { ok: true } | ValidationFailure;

interface CacheSlot<V> {
    value: V;
    expires_at: number;
}

export interface ValidateInput {
    polymarketMarketId: string;
    /** Trade direction. SELL doesn't drain pUSD — hedger receives it. */
    side: "BUY" | "SELL";
    /** Estimated max pUSD the bot would need to spend to hedge this trade. */
    estimatedHedgeCostUsd: number;
    /**
     * Hedge notional priced at the raw Polymarket top-of-book (no spread).
     * Used to gate orders below Polymarket's $1 minimum. Pass 0 if the book
     * is not yet warmed — that fails closed.
     */
    polymarketNotionalUsd: number;
}

export default class PreTradeValidator {
    private readonly gamma = new GammaClient();
    private readonly balance_monitor = new BalanceMonitorService();
    private readonly status_cache = new Map<
        string,
        CacheSlot<{ closed: boolean; archived: boolean; accepting_orders: boolean }>
    >();
    private balance_cache: CacheSlot<number> | null = null;
    private connection: Connection | null = null;
    private sdk: SolmarketClient | null = null;

    // ─────────── Throwing API used by the hedge-first orchestrator ───────────
    //
    // The legacy `validate()` method below returns a `ValidationResult` for the
    // legacy POST /quote controller. The orchestrator wants typed throws that
    // map straight to HTTP — the methods in this section throw `TradeError`.

    /**
     * Single pre-flight gate the orchestrator calls before any external write.
     * Runs gamma freshness, Polymarket min notional, platform funder balance,
     * and the user's USDC / share balance — in that order so we fail fast on
     * the cheapest checks first.
     */
    public async assert_pretrade(args: {
        userId: string;
        side: Side;
        outcome: Outcome;
        sizeShares: number;
        marketPda: string;
        polymarketMarketId: string;
        tokenId: string;
        polymarketSide: Side;
        topAskCents: number | null;
        topBidCents: number | null;
    }): Promise<void> {
        const reference_cents = this.reference_price_cents(
            args.polymarketSide,
            args.topAskCents,
            args.topBidCents,
        );
        const notional_usd = (args.sizeShares * reference_cents) / 100;
        const market_validation = await this.validate({
            polymarketMarketId: args.polymarketMarketId,
            side: args.side,
            estimatedHedgeCostUsd: notional_usd,
            polymarketNotionalUsd: notional_usd,
        });
        if (!market_validation.ok) throw this.translate_validation_failure(market_validation);
        await this.assert_user_can_trade(args);
    }

    /**
     * Treasury vault solvency check for SELL legs. Called AFTER the
     * Polymarket fill so we can use the exact `user_price_cents` rather
     * than a top-of-book estimate. A reject here means the Polymarket
     * leg already filled — caller should record orphan inventory.
     */
    public async assert_treasury_can_cover(
        shares: number,
        price_cents: number,
    ): Promise<void> {
        if (shares <= 0) return;
        const required = BigInt(shares) * BigInt(price_cents) * USDC_PER_CENT;
        const balance = await this.fetch_treasury_lamports();
        if (balance < required) {
            throw new TradeError(
                "INSUFFICIENT_TREASURY",
                503,
                `treasury has ${micro_to_usd(balance)} USDC, SELL payout needs ${micro_to_usd(required)} — admin top-up required`,
            );
        }
    }

    private async assert_user_can_trade(args: {
        userId: string;
        side: Side;
        outcome: Outcome;
        sizeShares: number;
        marketPda: string;
        tokenId: string;
        polymarketSide: Side;
        topAskCents: number | null;
        topBidCents: number | null;
    }): Promise<void> {
        const user_pubkey = await this.load_user_pubkey(args.userId);
        if (args.side === "BUY") {
            await this.assert_buy_funds(user_pubkey, args);
        } else {
            await this.assert_sell_shares(user_pubkey, args);
        }
    }

    private async assert_buy_funds(
        user_pubkey: PublicKey,
        args: {
            sizeShares: number;
            polymarketSide: Side;
            topAskCents: number | null;
            topBidCents: number | null;
        },
    ): Promise<void> {
        const cap_cents = this.buy_price_cap_cents(
            args.polymarketSide,
            args.topAskCents,
            args.topBidCents,
        );
        const required = BigInt(args.sizeShares) * BigInt(cap_cents) * USDC_PER_CENT;
        const balance = await this.fetch_user_usdc_lamports(user_pubkey);
        if (balance < required) {
            throw new TradeError(
                "INSUFFICIENT_USDC",
                402,
                `wallet has ${micro_to_usd(balance)} USDC, BUY needs up to ${micro_to_usd(required)} (${args.sizeShares} × ${cap_cents}¢) — top up to retry`,
            );
        }
    }

    private async assert_sell_shares(
        user_pubkey: PublicKey,
        args: { marketPda: string; outcome: Outcome; sizeShares: number },
    ): Promise<void> {
        const shares = await this.fetch_user_shares(user_pubkey, args.marketPda, args.outcome);
        if (shares < BigInt(args.sizeShares)) {
            throw new TradeError(
                "INSUFFICIENT_SHARES",
                409,
                `wallet has ${shares.toString()} ${args.outcome} shares, SELL needs ${args.sizeShares}`,
            );
        }
    }

    private async load_user_pubkey(user_id: string): Promise<PublicKey> {
        const row = await prisma.user.findUnique({
            where: { id: user_id },
            select: { custodialPublicKey: true },
        });
        if (!row?.custodialPublicKey) {
            throw new TradeError("USER_NO_WALLET", 409, "user has no custodial wallet");
        }
        return new PublicKey(row.custodialPublicKey);
    }

    /**
     * BUY price cap for the balance pre-check. We over-reserve by the
     * configured spread + a 2¢ buffer so a small adverse tick between
     * pre-flight and on-chain transfer doesn't fail the SPL transfer.
     */
    private buy_price_cap_cents(
        polymarket_side: Side,
        top_ask: number | null,
        top_bid: number | null,
    ): number {
        const reference = polymarket_side === "BUY" ? top_ask : top_bid;
        if (reference === null) return BUY_PRICE_FALLBACK_CENTS;
        const cap = reference + ENV.SERVER_QUOTE_SPREAD_CENTS + BUY_PRICE_BUFFER_CENTS;
        return Math.min(BUY_PRICE_FALLBACK_CENTS, Math.max(1, cap));
    }

    /** Reference price used for the Polymarket min-notional gate. Falls
     *  back to a conservative midpoint when the book is stale. */
    private reference_price_cents(
        polymarket_side: Side,
        top_ask: number | null,
        top_bid: number | null,
    ): number {
        const reference = polymarket_side === "BUY" ? top_ask : top_bid;
        if (reference !== null) return reference;
        return 50; // midpoint fallback; gates the order through the rest of the funnel
    }

    private translate_validation_failure(failure: ValidationFailure): TradeError {
        const mapping: Record<ValidationFailure["code"], { status: number; code: TradeErrorCode }> = {
            MARKET_CLOSED_ON_POLYMARKET: { status: 409, code: "MARKET_CLOSED_ON_POLYMARKET" },
            MARKET_NOT_ACCEPTING_ORDERS: { status: 409, code: "MARKET_NOT_ACCEPTING_ORDERS" },
            BELOW_HEDGE_MIN_NOTIONAL: { status: 422, code: "BELOW_HEDGE_MIN_NOTIONAL" },
            INSUFFICIENT_FUNDER_BALANCE: { status: 503, code: "INSUFFICIENT_FUNDER_BALANCE" },
        };
        const entry = mapping[failure.code];
        return new TradeError(entry.code, entry.status, failure.details);
    }

    private async fetch_user_usdc_lamports(user_pubkey: PublicKey): Promise<bigint> {
        const mint = new PublicKey(ENV.SERVER_USDC_MINT);
        const ata = getAssociatedTokenAddressSync(mint, user_pubkey);
        try {
            const acct = await getAccount(this.get_connection(), ata, "confirmed");
            return acct.amount;
        } catch {
            return BigInt(0);
        }
    }

    private async fetch_treasury_lamports(): Promise<bigint> {
        const sdk = this.get_sdk();
        try {
            const acct = await getAccount(this.get_connection(), sdk.treasuryVaultPda, "confirmed");
            return acct.amount;
        } catch {
            return BigInt(0);
        }
    }

    private async fetch_user_shares(
        user_pubkey: PublicKey,
        market_pda: string,
        outcome: Outcome,
    ): Promise<bigint> {
        const sdk = this.get_sdk();
        try {
            const pos = await sdk.fetchUserPosition(user_pubkey, new PublicKey(market_pda));
            return outcome === "YES" ? pos.yesShares : pos.noShares;
        } catch {
            // No UserPosition PDA = user never traded this market = 0 shares.
            return BigInt(0);
        }
    }

    private get_connection(): Connection {
        if (!this.connection) {
            this.connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        }
        return this.connection;
    }

    private get_sdk(): SolmarketClient {
        if (!this.sdk) {
            this.sdk = new SolmarketClient({
                connection: this.get_connection(),
                programId: new PublicKey(ENV.SERVER_SOLANA_PROGRAM_ID),
            });
        }
        return this.sdk;
    }

    // ─────────── Legacy validate() — used by controller.quote.ts ───────────

    public async validate(input: ValidateInput): Promise<ValidationResult> {
        const market_check = await this.check_market_status(input.polymarketMarketId);
        if (market_check && !market_check.ok) return market_check;

        if (input.polymarketNotionalUsd < POLYMARKET_MIN_NOTIONAL_USD) {
            return {
                ok: false,
                code: "BELOW_HEDGE_MIN_NOTIONAL",
                details: `polymarket requires $${POLYMARKET_MIN_NOTIONAL_USD.toFixed(2)} min notional — this order is $${input.polymarketNotionalUsd.toFixed(2)}`,
            };
        }

        // SELL hedges generate pUSD on Polymarket; no funder outflow to gate.
        if (input.side === "BUY") {
            const balance_check = await this.check_funder_balance(input.estimatedHedgeCostUsd);
            if (!balance_check.ok) return balance_check;
        }

        return { ok: true };
    }

    private async check_market_status(
        polymarket_market_id: string,
    ): Promise<ValidationResult | null> {
        const status = await this.get_status_cached(polymarket_market_id);
        if (!status) return null; // gamma unreachable — fail open, server should still be usable
        if (status.closed || status.archived) {
            return {
                ok: false,
                code: "MARKET_CLOSED_ON_POLYMARKET",
                details: `polymarket market ${polymarket_market_id} is closed`,
            };
        }
        if (!status.accepting_orders) {
            return {
                ok: false,
                code: "MARKET_NOT_ACCEPTING_ORDERS",
                details: `polymarket market ${polymarket_market_id} is not accepting orders`,
            };
        }
        return { ok: true };
    }

    private async get_status_cached(
        polymarket_market_id: string,
    ): Promise<{ closed: boolean; archived: boolean; accepting_orders: boolean } | null> {
        const slot = this.status_cache.get(polymarket_market_id);
        if (slot && slot.expires_at > Date.now()) return slot.value;
        const fresh = await this.gamma.fetch_market_status(polymarket_market_id);
        if (!fresh) return null;
        this.status_cache.set(polymarket_market_id, {
            value: fresh,
            expires_at: Date.now() + STATUS_TTL_MS,
        });
        return fresh;
    }

    private async check_funder_balance(estimated_cost_usd: number): Promise<ValidationResult> {
        const balance = await this.get_balance_cached();
        if (balance === null) {
            return { ok: true }; // balance unreadable — fail open rather than block all trading
        }
        const required = Math.max(estimated_cost_usd, 0) + MIN_FUNDER_BUFFER_PUSD;
        if (balance < required) {
            return {
                ok: false,
                code: "INSUFFICIENT_FUNDER_BALANCE",
                details: `funder pUSD ${balance.toFixed(2)} < required ${required.toFixed(2)}`,
            };
        }
        return { ok: true };
    }

    private async get_balance_cached(): Promise<number | null> {
        if (this.balance_cache && this.balance_cache.expires_at > Date.now()) {
            return this.balance_cache.value;
        }
        try {
            const snapshot = await this.balance_monitor.fetch_all();
            const fresh = snapshot.polygon.configured ? snapshot.polygon.funderPusd.amount : null;
            if (fresh !== null) {
                this.balance_cache = { value: fresh, expires_at: Date.now() + BALANCE_TTL_MS };
            }
            return fresh;
        } catch {
            return null;
        }
    }
}

/** Format micro-USDC (6-decimal raw) as a `$X.YY` string for error messages. */
function micro_to_usd(micro: bigint): string {
    const cents = micro / BigInt(10_000);
    const whole = cents / BigInt(100);
    const frac = (cents % BigInt(100)).toString().padStart(2, "0");
    return `$${whole}.${frac}`;
}
