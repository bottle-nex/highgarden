use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, NONCE_SEED};
use crate::errors::SolMarketError;
use crate::state::{Config, UsedNonce};

/// Reclaims the rent from a `UsedNonce` PDA. Admin-only — the contract
/// trusts the platform to only close nonces whose corresponding quote has
/// already expired (the on-chain `place_order` rejects expired quotes
/// independently, so even if a closed nonce were re-created and replayed,
/// the trade would still be rejected at the expiry check).
///
/// Args: the 16-byte nonce of the quote whose nonce-PDA we want to close.
/// We accept it as an instruction arg so the seeds line up — the PDA
/// address is derived from the nonce bytes.
#[derive(Accounts)]
#[instruction(nonce: [u8; 16])]
pub struct CloseUsedNonce<'info> {
    /// Receives the reclaimed rent. Must be `config.admin`.
    #[account(mut, address = config.admin @ SolMarketError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        close = admin,
        seeds = [NONCE_SEED, &nonce],
        bump = used_nonce.bump,
    )]
    pub used_nonce: Account<'info, UsedNonce>,
}

pub fn handler(_ctx: Context<CloseUsedNonce>, _nonce: [u8; 16]) -> Result<()> {
    // No body: account constraints handle everything (admin signs, close=admin
    // refunds the rent, seeds verify the PDA matches the nonce bytes).
    Ok(())
}
