import type { ListingStatus, MarketStatus, Outcome, Side } from "../prisma/enums.prisma";

// ─── On-chain wire formats ────────────────────────────────────────────────────
// These mirror the Anchor structs in apps/contract/programs/contract/src so the
// off-chain signer and the on-chain verifier agree on byte layout.

export const QUOTE_SIDE_BUY = 0 as const;
export const QUOTE_SIDE_SELL = 1 as const;
export type QuoteSide = typeof QUOTE_SIDE_BUY | typeof QUOTE_SIDE_SELL;

export const QUOTE_OUTCOME_YES = 0 as const;
export const QUOTE_OUTCOME_NO = 1 as const;
export type QuoteOutcome = typeof QUOTE_OUTCOME_YES | typeof QUOTE_OUTCOME_NO;

export interface SignedQuote {
  /** Solana Market PDA, base58 encoded. */
  market: string;
  side: QuoteSide;
  outcome: QuoteOutcome;
  /** Cents in [1, 99]. */
  price: number;
  /** Whole shares as decimal string to safely carry u64. */
  size: string;
  /** Unix seconds. */
  expiresAt: number;
  /** 16 random bytes as 32-char hex. */
  nonce: string;
  /** Ed25519 signature over the AnchorSerialize bytes of the quote, base58 encoded. */
  signature: string;
}

export interface OrderFilledEvent {
  /** User wallet, base58. */
  user: string;
  /** Market PDA, base58. */
  market: string;
  polymarketMarketId: string;
  side: QuoteSide;
  outcome: QuoteOutcome;
  /** u64 as decimal string. */
  size: string;
  /** Cents 1..99. */
  price: number;
  nonce: string;
}

// ─── Quote endpoint error codes ───────────────────────────────────────────────

export enum QuoteErrorCode {
  QUOTE_EXPIRED = "QUOTE_EXPIRED",
  OUT_OF_CAPACITY = "OUT_OF_CAPACITY",
  NONCE_USED = "NONCE_USED",
  SIG_INVALID = "SIG_INVALID",
  MARKET_CLOSED = "MARKET_CLOSED",
  MARKET_PAUSED = "MARKET_PAUSED",
  MARKET_NOT_FOUND = "MARKET_NOT_FOUND",
  PRICE_UNAVAILABLE = "PRICE_UNAVAILABLE",
}

// ─── REST DTOs ────────────────────────────────────────────────────────────────

/** Public market shape served by GET /api/v1/markets. */
export interface MarketDTO {
  id: string;
  name: string;
  description: string;
  endAt: string;
  status: MarketStatus;
  polyMarketId: string;
  yesTokenId: string;
  noTokenId: string;
  tickSize: string;
  negRisk: boolean;
  solanaMarketPda: string | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  imageUrl: string | null;
}

// ─── Order book ───────────────────────────────────────────────────────────────

export interface OrderBookLevelDTO {
  price: number;
  size: number;
}

/**
 * Tri-state describing why bids/asks may be empty:
 *   TRACKED       — at least one level on at least one side; render the ladder.
 *   TRACKED_EMPTY — book is being mirrored, just no resting orders yet.
 *   NOT_TRACKED   — server's BookCache isn't following this token (mirror
 *                   pipeline likely degraded or market not yet armed). The
 *                   controller will lazy-trigger an arm when this is returned.
 */
export type OrderBookStatus = "TRACKED" | "TRACKED_EMPTY" | "NOT_TRACKED";

/** Snapshot served by GET /api/v1/markets/:id/orderbook. */
export interface OrderBookSnapshotDTO {
  marketId: string;
  outcome: Outcome;
  tokenId: string;
  status: OrderBookStatus;
  bids: OrderBookLevelDTO[];
  asks: OrderBookLevelDTO[];
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  /** Epoch ms when the cache last touched this token. */
  updatedAt: number;
}

// ─── Price history ────────────────────────────────────────────────────────────

export type PriceHistoryRange = "1h" | "6h" | "1d" | "1w" | "1m" | "all";

export interface PriceHistoryPoint {
  /** Unix seconds. */
  t: number;
  /** Price in [0, 1]. */
  p: number;
}

/** Served by GET /api/v1/markets/:id/price-history. */
export interface PriceHistoryDTO {
  marketId: string;
  tokenId: string;
  range: PriceHistoryRange;
  history: PriceHistoryPoint[];
}

// ─── Recent trades ────────────────────────────────────────────────────────────

/** Served by GET /api/v1/markets/:id/trades. */
export interface RecentTradeDTO {
  id: string;
  side: Side;
  outcome: Outcome;
  /** Cents in [1, 99]. */
  price: number;
  /** Whole shares. */
  size: number;
  solanaTxSig: string;
  createdAt: string;
}

// ─── Market news ──────────────────────────────────────────────────────────────

/**
 * One news article tied to a market. Sourced from Google News RSS keyed off
 * the market title; refreshed on approval and on a periodic background job.
 * Served by GET /api/v1/markets/:id/news.
 */
export interface NewsArticleDTO {
  id: string;
  title: string;
  /** Google News redirect URL — opens the publisher article. */
  link: string;
  publicationName: string | null;
  /** Favicon URL (Google s2 service). */
  publicationFavicon: string | null;
  /** ISO timestamp of when the article was published. */
  pubDate: string | null;
}

/** Admin curator view served by GET /api/v1/admin/listings. */
export interface AdminListingDTO {
  marketId: string;
  status: ListingStatus;
  market: {
    id: string;
    name: string;
    description: string;
    endAt: string;
    status: MarketStatus;
    polyMarketId: string;
    solanaMarketPda: string | null;
  };
  polymarket: {
    yesTokenId: string;
    noTokenId: string;
    tickSize: string;
    negRisk: boolean;
  } | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  lastSyncedAt: string | null;
  discoveredAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}
