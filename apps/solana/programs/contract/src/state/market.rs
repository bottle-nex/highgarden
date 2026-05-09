use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::AccountInfo, program_error::ProgramError};

use crate::constants::{MAX_POLYMARKET_ID_LEN, MAX_TOKEN_ID_LEN};
use crate::utils::account::{load_account, save_account};
use crate::utils::discriminator::account_disc;

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketStatus {
    Open,
    Resolved,
    Cancelled,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct Market {
    pub polymarket_market_id: String,
    pub polymarket_market_id_hash: [u8; 32],
    pub question_hash: [u8; 32],
    pub end_time: i64,
    pub tick_size: u16,
    pub yes_token_id: String,
    pub no_token_id: String,
    pub status: MarketStatus,
    pub winning_outcome: Option<u8>,
    pub total_yes: u64,
    pub total_no: u64,
    pub paused: bool,
    pub bump: u8,
}

impl Market {
    pub const NAME: &'static str = "Market";

    /// Reserved bytes for the (variable-length) borsh body. Computed as the maximum size:
    ///   String: 4 (len) + max_bytes
    ///   [u8;N]: N
    ///   primitive: sizeof
    ///   Option<u8>: 1 (tag) + 1 (payload)
    ///   enum (no payload): 1
    pub const SPACE: usize = (4 + MAX_POLYMARKET_ID_LEN)   // polymarket_market_id
        + 32                                               // polymarket_market_id_hash
        + 32                                               // question_hash
        + 8                                                // end_time
        + 2                                                // tick_size
        + (4 + MAX_TOKEN_ID_LEN)                           // yes_token_id
        + (4 + MAX_TOKEN_ID_LEN)                           // no_token_id
        + 1                                                // status
        + 2                                                // winning_outcome
        + 8                                                // total_yes
        + 8                                                // total_no
        + 1                                                // paused
        + 1; // bump

    pub fn load(info: &AccountInfo) -> Result<Self, ProgramError> {
        load_account(info, &account_disc(Self::NAME))
    }

    pub fn save(&self, info: &AccountInfo) -> Result<(), ProgramError> {
        save_account(info, &account_disc(Self::NAME), self)
    }
}
