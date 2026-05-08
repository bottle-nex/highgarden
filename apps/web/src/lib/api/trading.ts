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

export type TradingErrorReason =
    | 'OUT_OF_CAPACITY'
    | 'MARKET_NOT_LISTED'
    | 'QUOTE_EXPIRED'
    | 'INSUFFICIENT_SHARES'
    | 'NOT_AUTHORIZED'
    | 'PLACE_ORDER_FAILED'
    | 'CLAIM_FAILED'
    | 'MARKET_NOT_RESOLVED'
    | 'NO_WINNING_SHARES'
    | 'MARKET_CLOSED_ON_POLYMARKET'
    | 'MARKET_NOT_ACCEPTING_ORDERS'
    | 'INSUFFICIENT_FUNDER_BALANCE'
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
                'Trading temporarily unavailable. Please try again in a moment.',
            );
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
        if (lower.includes('nowinningshares') || lower.includes('no winning shares')) {
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

const trading_api = new TradingApi();
export default trading_api;
