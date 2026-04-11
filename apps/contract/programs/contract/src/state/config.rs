use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
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
