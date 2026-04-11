use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const MARKET_SEED: &[u8] = b"market";

#[constant]
pub const POSITION_SEED: &[u8] = b"position";

#[constant]
pub const NONCE_SEED: &[u8] = b"nonce";

#[constant]
pub const TREASURY_AUTHORITY_SEED: &[u8] = b"treasury_authority";

#[constant]
pub const TREASURY_VAULT_SEED: &[u8] = b"treasury_vault";

pub const MAX_POLYMARKET_ID_LEN: usize = 128;
pub const MAX_TOKEN_ID_LEN: usize = 128;

pub const SIDE_BUY: u8 = 0;
pub const SIDE_SELL: u8 = 1;

pub const OUTCOME_YES: u8 = 0;
pub const OUTCOME_NO: u8 = 1;

pub const USDC_DECIMALS_MULTIPLIER: u64 = 1_000_000;
pub const USDC_PER_CENT: u64 = 10_000;
