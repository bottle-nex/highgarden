use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::log::sol_log_data;
use solana_program::program_error::ProgramError;
use solana_program::pubkey::Pubkey;

use crate::utils::discriminator::event_disc;

/// Anchor's `emit!` macro encodes events as the 8-byte event discriminator
/// followed by the borsh-serialized payload, then logs the buffer via
/// `sol_log_data`. We replicate that wire format here so existing client-side
/// IDL listeners keep parsing correctly.
fn emit<T: BorshSerialize>(name: &str, payload: &T) -> Result<(), ProgramError> {
    let body = borsh::to_vec(payload).map_err(|_| ProgramError::InvalidAccountData)?;
    let disc = event_disc(name);
    let mut buf = Vec::with_capacity(8 + body.len());
    buf.extend_from_slice(&disc);
    buf.extend_from_slice(&body);
    sol_log_data(&[&buf]);
    Ok(())
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
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

impl OrderFilled {
    pub fn emit(&self) -> Result<(), ProgramError> {
        emit("OrderFilled", self)
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct MarketResolved {
    pub market: Pubkey,
    pub winning_outcome: u8,
}

impl MarketResolved {
    pub fn emit(&self) -> Result<(), ProgramError> {
        emit("MarketResolved", self)
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct Claimed {
    pub user: Pubkey,
    pub market: Pubkey,
    pub outcome: u8,
    pub shares: u64,
    pub payout: u64,
}

impl Claimed {
    pub fn emit(&self) -> Result<(), ProgramError> {
        emit("Claimed", self)
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct PositionClosed {
    pub user: Pubkey,
    pub market: Pubkey,
    pub rent_recipient: Pubkey,
}

impl PositionClosed {
    pub fn emit(&self) -> Result<(), ProgramError> {
        emit("PositionClosed", self)
    }
}
