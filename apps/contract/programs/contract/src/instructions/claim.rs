use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::{
    CONFIG_SEED, OUTCOME_NO, OUTCOME_YES, POSITION_SEED, TREASURY_AUTHORITY_SEED,
    USDC_DECIMALS_MULTIPLIER,
};
use crate::errors::SolMarketError;
use crate::events::Claimed;
use crate::state::{Config, Market, MarketStatus, UserPosition};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump,
        has_one = user @ SolMarketError::Unauthorized,
        has_one = market @ SolMarketError::MarketMismatch,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        constraint = user_usdc.owner == user.key() @ SolMarketError::Unauthorized,
        constraint = user_usdc.mint == config.usdc_mint @ SolMarketError::Unauthorized,
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = config.treasury_vault @ SolMarketError::Unauthorized,
    )]
    pub treasury_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority over the treasury vault. Verified by seeds.
    #[account(
        seeds = [TREASURY_AUTHORITY_SEED],
        bump = config.treasury_authority_bump,
    )]
    pub treasury_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    let market = &ctx.accounts.market;
    require!(
        matches!(market.status, MarketStatus::Resolved),
        SolMarketError::MarketNotResolved
    );
    let winning = market
        .winning_outcome
        .ok_or(SolMarketError::MarketNotResolved)?;

    let user_position = &mut ctx.accounts.user_position;
    let shares = match winning {
        OUTCOME_YES => {
            let s = user_position.yes_shares;
            user_position.yes_shares = 0;
            s
        }
        OUTCOME_NO => {
            let s = user_position.no_shares;
            user_position.no_shares = 0;
            s
        }
        _ => return err!(SolMarketError::InvalidOutcome),
    };

    require!(shares > 0, SolMarketError::NoWinningShares);

    let payout = shares
        .checked_mul(USDC_DECIMALS_MULTIPLIER)
        .ok_or(SolMarketError::MathOverflow)?;

    let authority_bump = ctx.accounts.config.treasury_authority_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[TREASURY_AUTHORITY_SEED, &[authority_bump]]];
    let cpi_accounts = Transfer {
        from: ctx.accounts.treasury_vault.to_account_info(),
        to: ctx.accounts.user_usdc.to_account_info(),
        authority: ctx.accounts.treasury_authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer(cpi_ctx, payout)?;

    emit!(Claimed {
        user: ctx.accounts.user.key(),
        market: market.key(),
        outcome: winning,
        shares,
        payout,
    });

    Ok(())
}
