import type { MarketEvent, UserEvent, SocketState } from '@solmarket/polymarket-contracts';
import type { Fill, Market, Exposure } from '../prisma/marketplace.prisma';
import type { MarketStatus, Outcome } from '../prisma/enums.prisma';

// ─── Message type enum ────────────────────────────────────────────────────────

export enum MESSAGE_TYPES {
    // ── Forwarded from mirror → Redis → server → client ──────────────────────
    /** Full order-book snapshot for a token (mirrors `MarketEvent.event_type = "book"`) */
    BOOK = 'BOOK',
    /** Incremental price-level changes (mirrors `MarketEvent.event_type = "price_change"`) */
    PRICE_CHANGE = 'PRICE_CHANGE',
    /** Tick-size changed on Polymarket (mirrors `MarketEvent.event_type = "tick_size_change"`) */
    TICK_SIZE_CHANGE = 'TICK_SIZE_CHANGE',
    /** A trade was confirmed on our Polymarket user account */
    USER_TRADE = 'USER_TRADE',
    /** An order update on our Polymarket user account */
    USER_ORDER = 'USER_ORDER',
    /** Mirror socket state change (idle / connecting / open / reconnecting …) */
    MIRROR_STATUS = 'MIRROR_STATUS',

    // ── Application-level server → client ────────────────────────────────────
    /** A user's Solana `place_order` tx landed and was indexed */
    ORDER_FILLED = 'ORDER_FILLED',
    /** A market's `MarketStatus` changed (open / paused / resolved / cancelled) */
    MARKET_STATUS_CHANGE = 'MARKET_STATUS_CHANGE',
    /** A market was resolved with a winning outcome */
    MARKET_RESOLVED = 'MARKET_RESOLVED',
    /** Unhedged-delta tracker update for a market */
    EXPOSURE_UPDATE = 'EXPOSURE_UPDATE',
    /** Quote-capacity available / unavailable for a market */
    CAPACITY_STATUS = 'CAPACITY_STATUS',
    /** Server → client handshake acknowledgement */
    CONNECTION_ACK = 'CONNECTION_ACK',

    // ── Client → server ───────────────────────────────────────────────────────
    /** Subscribe to live book + price updates for a Polymarket token ID */
    SUBSCRIBE_MARKET = 'SUBSCRIBE_MARKET',
    /** Unsubscribe from live updates for a Polymarket token ID */
    UNSUBSCRIBE_MARKET = 'UNSUBSCRIBE_MARKET',
}

// ─── Payload types — mirrors ──────────────────────────────────────────────────

/** Full order-book snapshot forwarded from the mirror */
export type BookPayload = Extract<MarketEvent, { event_type: 'book' }>;

/** Incremental price-level update forwarded from the mirror */
export type PriceChangePayload = Extract<MarketEvent, { event_type: 'price_change' }>;

/** Tick-size change forwarded from the mirror */
export type TickSizeChangePayload = Extract<MarketEvent, { event_type: 'tick_size_change' }>;

/** Raw trade event from our Polymarket user account */
export type UserTradePayload = Extract<UserEvent, { event_type: 'trade' }>;

/** Raw order event from our Polymarket user account */
export type UserOrderPayload = Extract<UserEvent, { event_type: 'order' }>;

/** Mirror WebSocket state broadcast */
export interface MirrorStatusPayload {
    socket: 'market' | 'user';
    state: SocketState;
    /** Unix timestamp in ms */
    at: number;
}

// ─── Payload types — application ─────────────────────────────────────────────

export interface OrderFilledPayload {
    fill: Fill;
}

export interface MarketStatusChangePayload {
    marketId: string;
    status: MarketStatus;
    market: Pick<Market, 'id' | 'name' | 'status'>;
}

export interface MarketResolvedPayload {
    marketId: string;
    winningOutcome: Outcome;
    market: Pick<Market, 'id' | 'name' | 'resolvedAt' | 'winningOutcome'>;
}

export interface ExposureUpdatePayload {
    exposure: Exposure;
}

export interface CapacityStatusPayload {
    marketId: string;
    available: boolean;
    /** Current unhedged USD exposure */
    unhedgedUsd: number;
    /** Configured cap in USD */
    capUsd: number;
}

export interface ConnectionAckPayload {
    sessionId: string;
    serverTime: string;
}

// ─── Payload types — client → server ─────────────────────────────────────────

export interface SubscribeMarketPayload {
    /** Polymarket token ID (YES or NO asset_id) */
    tokenId: string;
}

// ─── Discriminated map ────────────────────────────────────────────────────────

export interface MessagePayloadMap {
    [MESSAGE_TYPES.BOOK]: BookPayload;
    [MESSAGE_TYPES.PRICE_CHANGE]: PriceChangePayload;
    [MESSAGE_TYPES.TICK_SIZE_CHANGE]: TickSizeChangePayload;
    [MESSAGE_TYPES.USER_TRADE]: UserTradePayload;
    [MESSAGE_TYPES.USER_ORDER]: UserOrderPayload;
    [MESSAGE_TYPES.MIRROR_STATUS]: MirrorStatusPayload;
    [MESSAGE_TYPES.ORDER_FILLED]: OrderFilledPayload;
    [MESSAGE_TYPES.MARKET_STATUS_CHANGE]: MarketStatusChangePayload;
    [MESSAGE_TYPES.MARKET_RESOLVED]: MarketResolvedPayload;
    [MESSAGE_TYPES.EXPOSURE_UPDATE]: ExposureUpdatePayload;
    [MESSAGE_TYPES.CAPACITY_STATUS]: CapacityStatusPayload;
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

/** Application-level close codes sent by the SolMarket server */
export enum SERVER_CLOSE_CODES {
    CLEAN_DISCONNECT = 4000,
    AUTH_REQUIRED = 4001,
    SESSION_EXPIRED = 4002,
    SERVER_SHUTDOWN = 4003,
}

/** WebSocket close codes that represent a clean, intentional shutdown */
const INTENTIONAL_CLOSE_CODES = new Set<number>([
    1000, // Normal closure
    1001, // Going away (page navigation)
    SERVER_CLOSE_CODES.CLEAN_DISCONNECT,
]);

export function isIntentionalClosure(code: number): boolean {
    return INTENTIONAL_CLOSE_CODES.has(code);
}
