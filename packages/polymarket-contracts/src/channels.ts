/** Value type stored in the polymarket:token:index HASH (JSON-encoded). */
export interface TokenIndexEntry {
  marketId: string;
  marketName: string;
  outcome: "YES" | "NO";
}

export const REDIS_CHANNELS = {
  control: "polymarket:control",
  status: "polymarket:status",

  // Durable source of truth for "mirror should follow these tokens". SET-typed.
  // Writers: server (server-side hydrate + admin approve/reject).
  // Readers: mirror on boot/reconnect via SMEMBERS to converge against drift.
  intent_set: "polymarket:intent:tokens",

  // HASH of token_id → JSON({marketId, marketName, outcome}). Lets mirror and
  // server enrich hot-path logs with human-readable market identity without
  // hitting Postgres. Writer: server. Readers: server + mirror.
  token_index: "polymarket:token:index",
  // Pub/sub nudge fired after token_index is mutated; payload is empty.
  token_index_changed: "polymarket:token:index:changed",

  // String KEY (with TTL) holding the mirror's current registry snapshot,
  // refreshed on every converge/subscribe/unsubscribe and a 5s heartbeat.
  // Null/expired = mirror unreachable. Diagnostic endpoint reads this.
  mirror_registry_key: "polymarket:mirror:registry",
  mirror_state_key: "polymarket:mirror:state",

  user_trade: "polymarket:user:trade",
  user_order: "polymarket:user:order",

  market_book: (token_id: string) => `polymarket:market:book:${token_id}`,
  market_price: (token_id: string) => `polymarket:market:price:${token_id}`,
  market_tick: (token_id: string) => `polymarket:market:tick:${token_id}`,
} as const;
