import { apiClient } from '../client.axios';

export interface QuoteRequestBody {
    side: 'BUY' | 'SELL';
    outcome: 'YES' | 'NO';
    size: number;
}

export interface SignedQuote {
    market: string;
    side: 0 | 1;
    outcome: 0 | 1;
    price: number;
    size: number;
    expiresAt: number;
    nonceHex: string;
    signatureBase64: string;
    signerPubkey: string;
}

export interface PlaceOrderResult {
    txSignature: string;
    marketPda: string;
    userPubkey: string;
}

export interface ClaimResult {
    txSignature: string;
    marketPda: string;
    userPubkey: string;
    /** Signature of the follow-up close_position tx, or null if it failed. */
    closePositionSignature: string | null;
}

/**
 * Single-call hedge-first trade response (PR 2/5 endpoint). The server has
 * already placed the Polymarket leg AND the Solana leg by the time the
 * client gets this back — no second round-trip needed.
 */
export interface HedgeFirstTradeResult {
    txSignature: string;
    polymarketOrderId: string;
    filledShares: number;
    pricePaidCents: number;
    totalUsd: number;
    requestId: string;
    /** True when an existing PlatformInventory row was netted instead of
     *  placing a fresh Polymarket order. UI may want to surface this. */
    nettedFromInventory: boolean;
}

export type TradingErrorReason =
    | 'OUT_OF_CAPACITY'
    | 'MARKET_NOT_LISTED'
    | 'MARKET_PAUSED'
    | 'MARKET_RESOLVED'
    | 'QUOTE_EXPIRED'
    | 'INSUFFICIENT_SHARES'
    | 'NOT_AUTHORIZED'
    | 'PLACE_ORDER_FAILED'
    | 'CLAIM_FAILED'
    | 'MARKET_NOT_RESOLVED'
    | 'NO_WINNING_SHARES'
    | 'ALREADY_CLAIMED'
    | 'MARKET_CLOSED_ON_POLYMARKET'
    | 'MARKET_NOT_ACCEPTING_ORDERS'
    | 'INSUFFICIENT_FUNDER_BALANCE'
    | 'INSUFFICIENT_USDC'
    | 'STALE_BOOK'
    | 'TRADE_UNAVAILABLE'
    | 'TRADE_RECONCILE_PENDING'
    | 'TRADE_ENDPOINT_DISABLED'
    | 'DUPLICATE_REQUEST'
    | 'NETWORK'
    | 'UNKNOWN';

export class TradingError extends Error {
    public readonly reason: TradingErrorReason;
    public readonly user_message: string;

    constructor(reason: TradingErrorReason, technical_message: string, user_message: string) {
        super(technical_message);
        this.reason = reason;
        this.user_message = user_message;
        this.name = 'TradingError';
    }
}

class TradingApi {
    public async request_quote(market_id: string, body: QuoteRequestBody): Promise<SignedQuote> {
        try {
            const { data } = await apiClient.post(`/markets/${market_id}/quote`, body);
            return data?.data as SignedQuote;
        } catch (err: unknown) {
            throw this.translate_error(err);
        }
    }

    public async place_order(market_id: string, signed: SignedQuote): Promise<PlaceOrderResult> {
        try {
            const { data } = await apiClient.post(`/markets/${market_id}/place-order`, signed);
            return data?.data as PlaceOrderResult;
        } catch (err: unknown) {
            throw this.translate_error(err);
        }
    }

    public async claim(market_id: string): Promise<ClaimResult> {
        try {
            const { data } = await apiClient.post(`/markets/${market_id}/claim`);
            return data?.data as ClaimResult;
        } catch (err: unknown) {
            throw this.translate_error(err);
        }
    }

    /**
     * Hedge-first trade. Single round-trip; server places the Polymarket
     * leg and the Solana leg in one orchestrated request. Generates a
     * UUIDv4 `requestId` per call so retries from a flaky network return
     * the same cached result instead of double-placing.
     *
     * Use this when `NEXT_PUBLIC_USE_HEDGE_FIRST_TRADE === "true"`. While
     * the flag is off the panel falls back to the legacy two-call
     * (`request_quote` + `place_order`) path for parity.
     */
    public async trade(
        market_id: string,
        body: { side: 'BUY' | 'SELL'; outcome: 'YES' | 'NO'; size: number },
    ): Promise<HedgeFirstTradeResult> {
        const requestId = generate_request_id();
        try {
            const { data } = await apiClient.post(`/markets/${market_id}/trade`, {
                ...body,
                requestId,
            });
            return data?.data as HedgeFirstTradeResult;
        } catch (err: unknown) {
            throw this.translate_error(err);
        }
    }

    private translate_error(err: unknown): TradingError {
        const code = this.extract_code(err);
        const raw = this.extract_message(err);
        return this.classify(code, raw);
    }

    private classify(code: string, raw: string): TradingError {
        const lower = raw.toLowerCase();
        if (code === 'NOT_AUTHORIZED') {
            return new TradingError('NOT_AUTHORIZED', raw, 'Please sign in to trade.');
        }
        if (code === 'OUT_OF_CAPACITY') {
            return new TradingError(
                'OUT_OF_CAPACITY',
                raw,
                'Market is busy right now. Please try again in a moment.',
            );
        }
        if (code === 'MARKET_NOT_LISTED_ON_SOLANA' || code === 'MARKET_NOT_APPROVED') {
            return new TradingError(
                'MARKET_NOT_LISTED',
                raw,
                'Trading is not yet available on this market.',
            );
        }
        if (code === 'MARKET_PAUSED') {
            return new TradingError(
                'MARKET_PAUSED',
                raw,
                'This market is paused. Try again later.',
            );
        }
        if (code === 'MARKET_RESOLVED') {
            return new TradingError(
                'MARKET_RESOLVED',
                raw,
                'This market has resolved — trading is closed.',
            );
        }
        if (code === 'STALE_BOOK') {
            return new TradingError(
                'STALE_BOOK',
                raw,
                'Live prices are unavailable right now. Try again in a moment.',
            );
        }
        if (code === 'TRADE_UNAVAILABLE') {
            return new TradingError(
                'TRADE_UNAVAILABLE',
                raw,
                'Trade unavailable right now. Try again shortly.',
            );
        }
        if (code === 'TRADE_RECONCILE_PENDING') {
            return new TradingError(
                'TRADE_RECONCILE_PENDING',
                raw,
                'Your trade is being finalized. Please refresh in a minute.',
            );
        }
        if (code === 'TRADE_ENDPOINT_DISABLED') {
            return new TradingError(
                'TRADE_ENDPOINT_DISABLED',
                raw,
                'Trading is temporarily disabled. Please try again shortly.',
            );
        }
        if (code === 'DUPLICATE_REQUEST') {
            return new TradingError(
                'DUPLICATE_REQUEST',
                raw,
                'A previous trade is still being processed. Please wait.',
            );
        }
        if (lower.includes('quoteexpired') || lower.includes('quote expired')) {
            return new TradingError(
                'QUOTE_EXPIRED',
                raw,
                'Price moved too quickly. Please try again.',
            );
        }
        if (lower.includes('insufficientshares') || lower.includes('insufficient shares')) {
            return new TradingError(
                'INSUFFICIENT_SHARES',
                raw,
                'You don’t have enough shares to sell.',
            );
        }
        if (code === 'MARKET_CLOSED_ON_POLYMARKET') {
            return new TradingError(
                'MARKET_CLOSED_ON_POLYMARKET',
                raw,
                'This market has just closed on Polymarket. Trading is paused.',
            );
        }
        if (code === 'MARKET_NOT_ACCEPTING_ORDERS') {
            return new TradingError(
                'MARKET_NOT_ACCEPTING_ORDERS',
                raw,
                'Market is not accepting new orders right now. Try again shortly.',
            );
        }
        if (code === 'INSUFFICIENT_FUNDER_BALANCE') {
            return new TradingError(
                'INSUFFICIENT_FUNDER_BALANCE',
                raw,
                'Trading is paused while we top up our hedge wallet. Please try again later.',
            );
        }
        if (code === 'INSUFFICIENT_USDC') {
            // Server's `message` is already user-grade — includes the exact
            // deficit ("wallet has $0.00 USDC, BUY needs up to $1.89 …") and
            // the top-up hint. Pass it through verbatim instead of overriding
            // with a curated string that would drop the dollar amounts.
            return new TradingError('INSUFFICIENT_USDC', raw, raw);
        }
        if (code === 'PLACE_ORDER_FAILED') {
            return new TradingError(
                'PLACE_ORDER_FAILED',
                raw,
                'Trade could not be submitted. Please try again.',
            );
        }
        if (code === 'MARKET_NOT_RESOLVED' || lower.includes('marketnotresolved')) {
            return new TradingError(
                'MARKET_NOT_RESOLVED',
                raw,
                'Market is not resolved yet. Try again after the result is final.',
            );
        }
        if (code === 'ALREADY_CLAIMED' || lower.includes('already claimed') || lower.includes('already redeemed')) {
            return new TradingError(
                'ALREADY_CLAIMED',
                raw,
                'You’ve already redeemed this market — refresh to clear the stale row.',
            );
        }
        if (code === 'NO_WINNING_SHARES' || lower.includes('nowinningshares') || lower.includes('no winning shares')) {
            return new TradingError(
                'NO_WINNING_SHARES',
                raw,
                'Nothing to claim — you don’t hold winning shares for this market.',
            );
        }
        if (code === 'CLAIM_FAILED') {
            return new TradingError(
                'CLAIM_FAILED',
                raw,
                'Claim could not be submitted. Please try again.',
            );
        }
        if (code === 'NETWORK') {
            return new TradingError(
                'NETWORK',
                raw,
                'Network issue. Please check your connection and try again.',
            );
        }
        return new TradingError('UNKNOWN', raw, 'Something went wrong. Please try again.');
    }

    private extract_code(err: unknown): string {
        if (this.is_axios_error(err)) {
            return err.response?.data?.error?.code ?? 'UNKNOWN';
        }
        return 'NETWORK';
    }

    private extract_message(err: unknown): string {
        if (this.is_axios_error(err)) {
            return err.response?.data?.message ?? err.message ?? 'Unknown error';
        }
        if (err instanceof Error) return err.message;
        return 'Unknown error';
    }

    private is_axios_error(err: unknown): err is {
        response?: { data?: { message?: string; error?: { code?: string } } };
        message?: string;
    } {
        return typeof err === 'object' && err !== null && 'response' in err;
    }
}

/** UUIDv4 with a tiny fallback for very old environments where
 *  `crypto.randomUUID` isn't on the global. The runtime hosts that matter
 *  for this app (modern Chrome/Safari/Firefox) all support it. */
function generate_request_id(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // RFC 4122 v4 fallback — collision-free enough for idempotency.
    const rand = (n: number) => Math.floor(Math.random() * n);
    const hex = (n: number, len: number) => n.toString(16).padStart(len, '0');
    return `${hex(rand(0x100000000), 8)}-${hex(rand(0x10000), 4)}-4${hex(rand(0x1000), 3)}-${hex(0x8 | rand(0x4), 1)}${hex(rand(0x1000), 3)}-${hex(rand(0x100000000), 8)}${hex(rand(0x10000), 4)}`;
}

const trading_api = new TradingApi();
export default trading_api;
