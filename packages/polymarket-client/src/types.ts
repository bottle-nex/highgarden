/**
 * Public types for the polymarket facade. Importable by both apps without
 * dragging in any app-specific imports (database, logger, etc.).
 */

/** "BUY" / "SELL" matches @solmarket/database's Side enum so the value flows
 *  through callers unchanged. Defined locally to keep this package
 *  database-independent. */
export type OrderSide = "BUY" | "SELL";

/**
 * Top-of-book snapshot used by pricing paths. Cents are integers
 * (multiplied by 100) because every downstream price math lives in integer
 * cents to avoid floating-point drift.
 */
export interface BookTop {
  bestBidCents: number | null;
  bestAskCents: number | null;
  bestBidSize: number | null;
  bestAskSize: number | null;
}

/**
 * Args for placing an immediate-or-cancel (FAK) order on Polymarket. The
 * `clientOrderId` is the dedupe primitive: Polymarket guarantees at-most-
 * once execution per (api_key, client_order_id) tuple, so on retry we
 * resubmit the same id rather than risk a duplicate.
 */
export interface PlaceMarketOrderInput {
  tokenId: string;
  side: OrderSide;
  sizeShares: number;
  priceCents: number;
  tickSize: string;
  negRisk: boolean;
  clientOrderId: string;
}

export interface PlaceMarketOrderResult {
  polymarketOrderId: string | null;
  filledShares: number;
  avgPriceCents: number | null;
  fullyFilled: boolean;
  raw?: unknown;
}

/**
 * Resolution snapshot pulled from Polymarket's gamma API.
 * `winningOutcomeIndex` is `0` for YES, `1` for NO, or `null` if the market
 * hasn't resolved or the prices are ambiguous (not unanimously 1/0).
 */
export interface GammaResolution {
  closed: boolean;
  archived: boolean;
  winningOutcomeIndex: 0 | 1 | null;
  resolvedAt: Date | null;
  outcomes: string[];
  outcomePrices: string[];
  conditionId: string | null;
  /** True for NegRisk multi-outcome markets — redemption uses a different contract. */
  negRisk: boolean;
}

/** Outcome of a Polygon `redeemPositions` attempt. Discriminated union to
 *  make caller-side branching obvious. */
export type RedeemOutcome =
  | { kind: "submitted"; txHash: string }
  | { kind: "skipped_neg_risk" }
  | { kind: "skipped_no_condition_id" }
  | { kind: "skipped_not_resolved" };
