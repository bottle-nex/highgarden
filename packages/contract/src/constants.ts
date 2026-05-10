/**
 * Mirror of the constants in `apps/solana/programs/contract/src/constants.rs`.
 * The Rust program is the source of truth; this file MUST stay byte-for-byte
 * identical with it. Any change in seeds or limits must land in both places.
 */

export const CONFIG_SEED = Buffer.from("config");
export const MARKET_SEED = Buffer.from("market");
export const POSITION_SEED = Buffer.from("position");
export const NONCE_SEED = Buffer.from("nonce");
export const TREASURY_AUTHORITY_SEED = Buffer.from("treasury_authority");
export const TREASURY_VAULT_SEED = Buffer.from("treasury_vault");

export const MAX_POLYMARKET_ID_LEN = 128;
export const MAX_TOKEN_ID_LEN = 128;

export const SIDE_BUY = 0;
export const SIDE_SELL = 1;
export const OUTCOME_YES = 0;
export const OUTCOME_NO = 1;

export const USDC_DECIMALS_MULTIPLIER = BigInt(1_000_000);
export const USDC_PER_CENT = BigInt(10_000);

/**
 * Anchor-compatible 8-byte discriminator that prefixes every account body
 * and instruction payload. Native-rust handlers replicate the same prefix
 * to keep the wire format identical.
 */
export const ANCHOR_DISCRIMINATOR_LEN = 8;

/**
 * SignedQuote borsh layout, fixed-size:
 *   market(32) + side(1) + outcome(1) + price(2 LE) + size(8 LE)
 *   + expires_at(8 LE) + nonce(16) = 68 bytes
 */
export const SIGNED_QUOTE_BYTES = 68;
