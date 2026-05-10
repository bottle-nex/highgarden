use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

use crate::utils::account::{load_account, save_account};
use crate::utils::discriminator::account_disc;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct UserPosition {
    pub user: Pubkey,
    pub market: Pubkey,
    pub yes_shares: u64,
    pub no_shares: u64,
    pub bump: u8,
}

impl UserPosition {
    pub const NAME: &'static str = "UserPosition";
    pub const SPACE: usize = 32 + 32 + 8 + 8 + 1;

    pub fn load(info: &AccountInfo) -> Result<Self, ProgramError> {
        load_account(info, &account_disc(Self::NAME))
    }

    pub fn save(&self, info: &AccountInfo) -> Result<(), ProgramError> {
        save_account(info, &account_disc(Self::NAME), self)
    }
}
