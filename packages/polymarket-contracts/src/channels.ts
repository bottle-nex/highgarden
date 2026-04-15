export const REDIS_CHANNELS = {
  control: "polymarket:control",
  status: "polymarket:status",

  user_trade: "polymarket:user:trade",
  user_order: "polymarket:user:order",

  market_book: (token_id: string) => `polymarket:market:book:${token_id}`,
  market_price: (token_id: string) => `polymarket:market:price:${token_id}`,
  market_tick: (token_id: string) => `polymarket:market:tick:${token_id}`,
} as const;
