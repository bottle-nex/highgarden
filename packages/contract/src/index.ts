/**
 * `@solmarket/contract` — TypeScript SDK for the native-Rust SolMarket
 * program at `apps/solana`. Replaces the prior Anchor-IDL-backed SDK.
 *
 * Public surface: re-exports the client class, types, decoders, and
 * borsh helpers. Discriminator and seed constants are exposed for
 * advanced callers but most consumers should just construct a
 * `SolmarketClient` and use its methods.
 */

export { SolmarketClient } from "./client";
export type { SolmarketClientOptions } from "./client";

export {
  EventLogDecoder,
  decode_config_account,
  decode_market_account,
  decode_used_nonce_account,
  decode_user_position_account,
} from "./decode";

export {
  BorshWriter,
  encode_close_used_nonce_args,
  encode_create_market_args,
  encode_empty_args,
  encode_initialize_config_args,
  encode_place_order_args,
  encode_resolve_market_args,
  serialize_signed_quote,
} from "./serialize";

export { account_disc, event_disc, ix_disc } from "./discriminator";

export {
  ANCHOR_DISCRIMINATOR_LEN,
  CONFIG_SEED,
  MARKET_SEED,
  NONCE_SEED,
  OUTCOME_NO,
  OUTCOME_YES,
  POSITION_SEED,
  SIDE_BUY,
  SIDE_SELL,
  SIGNED_QUOTE_BYTES,
  TREASURY_AUTHORITY_SEED,
  TREASURY_VAULT_SEED,
  USDC_DECIMALS_MULTIPLIER,
  USDC_PER_CENT,
} from "./constants";

export type {
  AdminMarketParams,
  ClaimParams,
  ClaimedEvent,
  ClosePositionParams,
  CloseUsedNonceParams,
  ConfigAccount,
  CreateMarketParams,
  CreateMarketResult,
  InitializeConfigParams,
  MarketAccount,
  MarketResolvedEvent,
  MarketStatus,
  OrderFilledEvent,
  OrderSide,
  Outcome,
  PlaceOrderParams,
  PositionClosedEvent,
  QuoteInput,
  ResolveMarketParams,
  UsedNonceAccount,
  UserPositionAccount,
} from "./types";
