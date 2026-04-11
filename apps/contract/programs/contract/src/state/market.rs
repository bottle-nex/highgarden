use anchor_lang::prelude::*;

use crate::constants::{MAX_POLYMARKET_ID_LEN, MAX_TOKEN_ID_LEN};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum MarketStatus {
    Open,
    Resolved,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    #[max_len(MAX_POLYMARKET_ID_LEN)]
    pub polymarket_market_id: String,
    pub polymarket_market_id_hash: [u8; 32],
    pub question_hash: [u8; 32],
    pub end_time: i64,
    pub tick_size: u16,
    #[max_len(MAX_TOKEN_ID_LEN)]
    pub yes_token_id: String,
    #[max_len(MAX_TOKEN_ID_LEN)]
    pub no_token_id: String,
    pub status: MarketStatus,
    pub winning_outcome: Option<u8>,
    pub total_yes: u64,
    pub total_no: u64,
    pub paused: bool,
    pub bump: u8,
}
