export interface OrderFilledPayload {
  user: string;
  market: string;
  polymarketMarketId: string;
  side: number;
  outcome: number;
  size: string;
  price: number;
  nonceHex: string;
}

export interface HedgeJobData {
  event: OrderFilledPayload;
  source: "live" | "poller" | "recovery";
  signature: string;
  slot: number;
  enqueuedAt: number;
}

export interface HedgeJobResult {
  status: "FILLED" | "PARTIAL" | "FAILED" | "SKIPPED";
  filledSize?: number;
  avgPriceCents?: number;
  polymarketOrderId?: string;
  reason?: string;
}
