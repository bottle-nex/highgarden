import type { MarketStatus, Outcome, Side } from "../prisma/enums.prisma";

export type PositionStatus = "OPEN" | "WON" | "LOST";

export interface PositionDTO {
  marketId: string;
  marketName: string;
  marketImage: string | null;
  marketStatus: MarketStatus;
  winningOutcome: Outcome | null;
  endAt: string;
  outcome: Outcome;
  shares: number;
  avgCostCents: number;
  currentPriceCents: number | null;
  tradedUsd: number;
  toWinUsd: number;
  valueUsd: number;
  status: PositionStatus;
  claimableUsd: number;
}

export interface FillDTO {
  id: string;
  marketId: string;
  marketName: string;
  side: Side;
  outcome: Outcome;
  priceCents: number;
  size: number;
  txSig: string;
  createdAt: string;
}

export type ActivityKindDTO = "DEPOSIT" | "WITHDRAWAL" | "CLAIM" | "TRADE";
export type ActivityStatusDTO = "PENDING" | "DONE" | "FAILED";

export interface ActivityDTO {
  id: string;
  kind: ActivityKindDTO;
  status: ActivityStatusDTO;
  /** Exact raw lamports (SOL) or micro-USDC, encoded as decimal strings. */
  amountRaw: string;
  unit: "SOL" | "USDC";
  convertedUsdcRaw: string | null;
  marketId: string | null;
  marketName: string | null;
  side: Side | null;
  outcome: Outcome | null;
  destination: string | null;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  transactions: { signature: string; url: string | null }[];
}

export interface ActivityPageDTO {
  items: ActivityDTO[];
  nextCursor: string | null;
}
