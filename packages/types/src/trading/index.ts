import type { ListingStatus, MarketStatus } from "../prisma/enums.prisma";

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
