pub const CONFIG_SEED: &[u8] = b"config";
pub const MARKET_SEED: &[u8] = b"market";
pub const POSITION_SEED: &[u8] = b"position";
pub const NONCE_SEED: &[u8] = b"nonce";
pub const TREASURY_AUTHORITY_SEED: &[u8] = b"treasury_authority";
pub const TREASURY_VAULT_SEED: &[u8] = b"treasury_vault";

pub const MAX_POLYMARKET_ID_LEN: usize = 128;
pub const MAX_TOKEN_ID_LEN: usize = 128;

pub const SIDE_BUY: u8 = 0;
pub const SIDE_SELL: u8 = 1;

pub const OUTCOME_YES: u8 = 0;
pub const OUTCOME_NO: u8 = 1;

pub const USDC_DECIMALS_MULTIPLIER: u64 = 1_000_000;
pub const USDC_PER_CENT: u64 = 10_000;

pub const ANCHOR_DISCRIMINATOR_LEN: usize = 8;
