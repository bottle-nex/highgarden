use anchor_lang::prelude::*;

#[event]
pub struct OrderFilled {
    pub user: Pubkey,
    pub market: Pubkey,
    pub polymarket_market_id: String,
    pub side: u8,
    pub outcome: u8,
    pub size: u64,
    pub price: u16,
    pub nonce: [u8; 16],
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub winning_outcome: u8,
}

#[event]
pub struct Claimed {
    pub user: Pubkey,
    pub market: Pubkey,
    pub outcome: u8,
    pub shares: u64,
    pub payout: u64,
}
