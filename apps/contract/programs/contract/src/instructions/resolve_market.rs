use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, MARKET_SEED, OUTCOME_NO, OUTCOME_YES};
use crate::errors::SolMarketError;
use crate::events::MarketResolved;
use crate::state::{Config, Market, MarketStatus};

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = oracle_signer @ SolMarketError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    pub oracle_signer: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.polymarket_market_id_hash.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<ResolveMarket>, winning_outcome: u8) -> Result<()> {
    require!(
        winning_outcome == OUTCOME_YES || winning_outcome == OUTCOME_NO,
        SolMarketError::InvalidOutcome
    );

    let market = &mut ctx.accounts.market;
    require!(
        matches!(market.status, MarketStatus::Open),
        SolMarketError::MarketClosed
    );

    market.status = MarketStatus::Resolved;
    market.winning_outcome = Some(winning_outcome);

    emit!(MarketResolved {
        market: market.key(),
        winning_outcome,
    });

    Ok(())
}
