use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

use crate::constants::{CONFIG_SEED, MARKET_SEED, MAX_POLYMARKET_ID_LEN, MAX_TOKEN_ID_LEN};
use crate::errors::SolMarketError;
use crate::state::{Config, Market, MarketStatus};

#[derive(Accounts)]
#[instruction(polymarket_market_id_hash: [u8; 32])]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ SolMarketError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, polymarket_market_id_hash.as_ref()],
        bump,
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateMarket>,
    polymarket_market_id_hash: [u8; 32],
    polymarket_market_id: String,
    question_hash: [u8; 32],
    end_time: i64,
    tick_size: u16,
    yes_token_id: String,
    no_token_id: String,
) -> Result<()> {
    require!(
        polymarket_market_id.as_bytes().len() <= MAX_POLYMARKET_ID_LEN,
        SolMarketError::InvalidMarketId
    );
    require!(
        yes_token_id.as_bytes().len() <= MAX_TOKEN_ID_LEN
            && no_token_id.as_bytes().len() <= MAX_TOKEN_ID_LEN,
        SolMarketError::InvalidMarketId
    );

    let computed = hash(polymarket_market_id.as_bytes()).to_bytes();
    require!(
        computed == polymarket_market_id_hash,
        SolMarketError::InvalidMarketId
    );

    let clock = Clock::get()?;
    require!(end_time > clock.unix_timestamp, SolMarketError::MarketEnded);
    require!(tick_size > 0, SolMarketError::InvalidPrice);

    let market = &mut ctx.accounts.market;
    market.polymarket_market_id = polymarket_market_id;
    market.polymarket_market_id_hash = polymarket_market_id_hash;
    market.question_hash = question_hash;
    market.end_time = end_time;
    market.tick_size = tick_size;
    market.yes_token_id = yes_token_id;
    market.no_token_id = no_token_id;
    market.status = MarketStatus::Open;
    market.winning_outcome = None;
    market.total_yes = 0;
    market.total_no = 0;
    market.paused = false;
    market.bump = ctx.bumps.market;

    Ok(())
}
