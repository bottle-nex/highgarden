/**
 * Compact serialization of an `OrderFilledEvent` suitable for storing in
 * a BullMQ job payload. Every field is JSON-safe (PublicKeys are
 * base58, bigints are decimal strings, buffers are hex). The processor
 * reverses this back into rich types when it dequeues the job.
 *
 * Renaming any of these fields is a breaking change for in-flight jobs
 * — version the queue (different name) instead.
 */
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

/**
 * Full BullMQ job data envelope. `source` lets the processor record
 * whether this fill was first observed by the live listener or the
 * catch-up poller (or scheduled by recovery on boot). `signature` and
 * `slot` are kept on the payload for ops triage — every job traces back
 * to a specific Solana tx.
 */
export interface HedgeJobData {
  event: OrderFilledPayload;
  source: "live" | "poller" | "recovery";
  signature: string;
  slot: number;
  enqueuedAt: number;
}

/**
 * What the worker returns when the job completes. SKIPPED means the
 * hedge was already terminal when we picked the job up (recovery
 * scenario); FILLED / PARTIAL / FAILED mirror the DB hedge status.
 */
export interface HedgeJobResult {
  status: "FILLED" | "PARTIAL" | "FAILED" | "SKIPPED";
  filledSize?: number;
  avgPriceCents?: number;
  polymarketOrderId?: string;
  reason?: string;
}
