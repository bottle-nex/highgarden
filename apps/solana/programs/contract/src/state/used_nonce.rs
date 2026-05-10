use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::AccountInfo, program_error::ProgramError};

use crate::utils::account::{load_account, save_account};
use crate::utils::discriminator::account_disc;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct UsedNonce {
    pub nonce: [u8; 16],
    pub bump: u8,
}

impl UsedNonce {
    pub const NAME: &'static str = "UsedNonce";
    pub const SPACE: usize = 16 + 1;

    pub fn load(info: &AccountInfo) -> Result<Self, ProgramError> {
        load_account(info, &account_disc(Self::NAME))
    }

    pub fn save(&self, info: &AccountInfo) -> Result<(), ProgramError> {
        save_account(info, &account_disc(Self::NAME), self)
    }
}
