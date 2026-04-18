import type { MarketEvent } from "@solmarket/polymarket-contracts";

export type {
  MarketEvent,
  UserEvent,
  SocketState,
  ControlMessage,
  SIDE,
} from "@solmarket/polymarket-contracts";
export { REDIS_CHANNELS } from "@solmarket/polymarket-contracts";
import type { Outcome } from "../prisma/enums.prisma";

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum SERVER_MESSAGE_TYPE {
  MARKET = "market",
  ERROR = "error",
  SUBSCRIBED = "subscribed",
  UNSUBSCRIBED = "unsubscribed",
  PONG = "pong",
}

export enum CLIENT_MESSAGE_TYPE {
  SUBSCRIBE = "subscribe",
  UNSUBSCRIBE = "unsubscribe",
  PING = "ping",
}

export enum SERVER_CLOSE_CODES {
  CLEAN_DISCONNECT = 4000,
  AUTH_REQUIRED = 4001,
  SESSION_EXPIRED = 4002,
  SERVER_SHUTDOWN = 4003,
}

// ─── Message shapes ───────────────────────────────────────────────────────────

export type ServerMessage =
  | { type: SERVER_MESSAGE_TYPE.MARKET; event: MarketEvent }
  | { type: SERVER_MESSAGE_TYPE.ERROR; message: string }
  | { type: SERVER_MESSAGE_TYPE.SUBSCRIBED; token_id: string }
  | { type: SERVER_MESSAGE_TYPE.UNSUBSCRIBED; token_id: string }
  | { type: SERVER_MESSAGE_TYPE.PONG };

export type ClientMessage =
  | { type: CLIENT_MESSAGE_TYPE.SUBSCRIBE; token_id: string }
  | { type: CLIENT_MESSAGE_TYPE.UNSUBSCRIBE; token_id: string }
  | { type: CLIENT_MESSAGE_TYPE.PING };

// ─── Frontend helper types ────────────────────────────────────────────────────
// Server-enriched view of a book/price event: asset_id mapped to app-level
// identifiers, top-of-book prices computed, and spread applied.

export interface PriceUpdatePayload {
  marketId: string;
  outcome: Outcome;
  bestAsk: number;
  bestBid: number;
  /** Spread-adjusted quoted price */
  quotedPrice: number;
  updatedAt: string;
}

// ─── Handler helpers ──────────────────────────────────────────────────────────

export type ServerMessageHandler<T extends SERVER_MESSAGE_TYPE> = (
  msg: Extract<ServerMessage, { type: T }>,
) => void;

// ─── Close-code helpers ───────────────────────────────────────────────────────

const INTENTIONAL_CLOSE_CODES = new Set<number>([
  1000, // Normal closure
  1001, // Going away
  SERVER_CLOSE_CODES.CLEAN_DISCONNECT,
]);

export function isIntentionalClosure(code: number): boolean {
  return INTENTIONAL_CLOSE_CODES.has(code);
}
