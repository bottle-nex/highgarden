use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, MARKET_SEED};
use crate::errors::SolMarketError;
use crate::state::{Config, Market};

#[derive(Accounts)]
pub struct AdminPauseMarket<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ SolMarketError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.polymarket_market_id_hash.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
}

pub fn pause_handler(ctx: Context<AdminPauseMarket>) -> Result<()> {
    ctx.accounts.market.paused = true;
    Ok(())
}

pub fn unpause_handler(ctx: Context<AdminPauseMarket>) -> Result<()> {
    ctx.accounts.market.paused = false;
    Ok(())
}
