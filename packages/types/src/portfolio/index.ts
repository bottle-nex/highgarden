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
