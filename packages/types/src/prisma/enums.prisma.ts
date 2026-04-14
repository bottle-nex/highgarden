export enum Side {
  BUY = "BUY",
  SELL = "SELL",
}

export enum Outcome {
  YES = "YES",
  NO = "NO",
}

export enum MarketStatus {
  OPEN = "OPEN",
  PAUSED = "PAUSED",
  RESOLVED = "RESOLVED",
  CANCELLED = "CANCELLED",
}

export enum HedgeStatus {
  PENDING = "PENDING",
  FILLED = "FILLED",
  PARTIAL = "PARTIAL",
  FAILED = "FAILED",
}

export enum Chain {
  SOLANA = "SOLANA",
  POLYGON = "POLYGON",
}

export enum ListingStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}
