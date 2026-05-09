use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

use crate::utils::account::{load_account, save_account};
use crate::utils::discriminator::account_disc;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct Config {
    pub admin: Pubkey,
    pub oracle_signer: Pubkey,
    pub quote_signer: Pubkey,
    pub treasury_vault: Pubkey,
    pub usdc_mint: Pubkey,
    pub treasury_authority_bump: u8,
    pub treasury_vault_bump: u8,
    pub bump: u8,
}

impl Config {
    pub const NAME: &'static str = "Config";
    pub const SPACE: usize = 32 * 5 + 3;

    pub fn load(info: &AccountInfo) -> Result<Self, ProgramError> {
        load_account(info, &account_disc(Self::NAME))
    }

    pub fn save(&self, info: &AccountInfo) -> Result<(), ProgramError> {
        save_account(info, &account_disc(Self::NAME), self)
    }
}
