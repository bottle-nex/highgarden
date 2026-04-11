use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SignedQuote {
    pub market: Pubkey,
    pub side: u8,
    pub outcome: u8,
    pub price: u16,
    pub size: u64,
    pub expires_at: i64,
    pub nonce: [u8; 16],
}
