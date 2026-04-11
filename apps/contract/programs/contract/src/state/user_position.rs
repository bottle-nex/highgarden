use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace, Default)]
pub struct UserPosition {
    pub user: Pubkey,
    pub market: Pubkey,
    pub yes_shares: u64,
    pub no_shares: u64,
    pub bump: u8,
}
