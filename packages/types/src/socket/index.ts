import type { Fill, Market, Exposure } from '../prisma/marketplace.prisma';
import type { MarketStatus, Outcome, Side } from '../prisma/enums.prisma';

// ─── Message type enum ────────────────────────────────────────────────────────

export enum MESSAGE_TYPES {
    // Server → client: live price / order-book snapshot for a market
    PRICE_UPDATE = 'PRICE_UPDATE',
    // Server → client: market open/paused/resolved/cancelled
    MARKET_STATUS_CHANGE = 'MARKET_STATUS_CHANGE',
    // Server → client: a user's on-chain order was confirmed and filled
    ORDER_FILLED = 'ORDER_FILLED',
    // Server → client: unhedged-delta tracker update for a market
    EXPOSURE_UPDATE = 'EXPOSURE_UPDATE',
    // Server → client: quote capacity available / unavailable
    CAPACITY_STATUS = 'CAPACITY_STATUS',
    // Server → client: market has been resolved with a winning outcome
    MARKET_RESOLVED = 'MARKET_RESOLVED',
    // Server → client: handshake acknowledgement
    CONNECTION_ACK = 'CONNECTION_ACK',
    // Client → server: subscribe to a market's live feed
    SUBSCRIBE_MARKET = 'SUBSCRIBE_MARKET',
    // Client → server: unsubscribe from a market's live feed
    UNSUBSCRIBE_MARKET = 'UNSUBSCRIBE_MARKET',
}

// ─── Per-message payload shapes ───────────────────────────────────────────────

export interface PriceUpdatePayload {
    marketId: string;
    outcome: Outcome;
    side: Side;
    bestAsk: number;
    bestBid: number;
    /** Our quoted price (Polymarket best ± spread) */
    quotedPrice: number;
    updatedAt: string;
}

export interface MarketStatusChangePayload {
    marketId: string;
    status: MarketStatus;
    market: Pick<Market, 'id' | 'name' | 'status'>;
}

export interface OrderFilledPayload {
    fill: Fill;
}

export interface ExposureUpdatePayload {
    exposure: Exposure;
}

export interface CapacityStatusPayload {
    marketId: string;
    available: boolean;
    /** Current unhedged USD delta */
    unhedgedUsd: number;
    /** Configured cap in USD */
    capUsd: number;
}

export interface MarketResolvedPayload {
    marketId: string;
    winningOutcome: Outcome;
    market: Pick<Market, 'id' | 'name' | 'resolvedAt' | 'winningOutcome'>;
}

export interface ConnectionAckPayload {
    sessionId: string;
    serverTime: string;
}

export interface SubscribeMarketPayload {
    marketId: string;
}

// ─── Discriminated union helpers ──────────────────────────────────────────────

export interface MessagePayloadMap {
    [MESSAGE_TYPES.PRICE_UPDATE]: PriceUpdatePayload;
    [MESSAGE_TYPES.MARKET_STATUS_CHANGE]: MarketStatusChangePayload;
    [MESSAGE_TYPES.ORDER_FILLED]: OrderFilledPayload;
    [MESSAGE_TYPES.EXPOSURE_UPDATE]: ExposureUpdatePayload;
    [MESSAGE_TYPES.CAPACITY_STATUS]: CapacityStatusPayload;
    [MESSAGE_TYPES.MARKET_RESOLVED]: MarketResolvedPayload;
    [MESSAGE_TYPES.CONNECTION_ACK]: ConnectionAckPayload;
    [MESSAGE_TYPES.SUBSCRIBE_MARKET]: SubscribeMarketPayload;
    [MESSAGE_TYPES.UNSUBSCRIBE_MARKET]: SubscribeMarketPayload;
}

export interface MessagePayload<T extends MESSAGE_TYPES = MESSAGE_TYPES> {
    type: T;
    payload: MessagePayloadMap[T];
}

export type AnyMessagePayload = {
    [T in MESSAGE_TYPES]: MessagePayload<T>;
}[MESSAGE_TYPES];

export type MessageHandler<T extends MESSAGE_TYPES = MESSAGE_TYPES> = (
    payload: MessagePayloadMap[T],
) => void;

export type ParsedMessage = {
    type: MESSAGE_TYPES;
    payload: AnyMessagePayload['payload'];
};

// ─── Close-code helpers ───────────────────────────────────────────────────────

/** WebSocket close codes that represent a clean, intentional shutdown */
const INTENTIONAL_CLOSE_CODES = new Set([
    1000, // Normal closure
    1001, // Going away (page navigation)
    4000, // Application-level clean disconnect
]);

export function isIntentionalClosure(code: number): boolean {
    return INTENTIONAL_CLOSE_CODES.has(code);
}

/** Application-level close codes sent by the SolMarket server */
export enum SERVER_CLOSE_CODES {
    CLEAN_DISCONNECT = 4000,
    AUTH_REQUIRED = 4001,
    SESSION_EXPIRED = 4002,
    SERVER_SHUTDOWN = 4003,
}
