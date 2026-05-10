/**
 * Typed errors thrown out of the trade orchestrator + pre-trade validator.
 * Lives in its own file so the validator can throw `TradeError` without
 * pulling the whole orchestrator module (which would cause an import cycle).
 *
 * Every code maps to a specific HTTP status that the controller surfaces
 * unchanged to the client.
 */

export type TradeErrorCode =
    | "MARKET_NOT_FOUND"
    | "MARKET_NOT_LISTED_ON_SOLANA"
    | "MARKET_PAUSED"
    | "MARKET_RESOLVED"
    | "MARKET_ENDED"
    | "MARKET_CLOSED_ON_POLYMARKET"
    | "STALE_BOOK"
    | "TRADE_UNAVAILABLE"
    | "TRADE_RECONCILE_PENDING"
    | "INSUFFICIENT_USDC"
    | "INSUFFICIENT_TREASURY"
    | "INSUFFICIENT_SHARES"
    | "INSUFFICIENT_FUNDER_BALANCE"
    | "MARKET_NOT_ACCEPTING_ORDERS"
    | "BELOW_HEDGE_MIN_NOTIONAL"
    | "EXPOSURE_LIMIT"
    | "USER_NO_WALLET";

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
