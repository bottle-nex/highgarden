use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct UsedNonce {
    pub nonce: [u8; 16],
    pub bump: u8,
}
