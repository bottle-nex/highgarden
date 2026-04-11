use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_SYSVAR_ID;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::{
    CONFIG_SEED, NONCE_SEED, OUTCOME_NO, OUTCOME_YES, POSITION_SEED, SIDE_BUY, SIDE_SELL,
    TREASURY_AUTHORITY_SEED, USDC_PER_CENT,
};
use crate::errors::SolMarketError;
use crate::events::OrderFilled;
use crate::state::{Config, Market, MarketStatus, SignedQuote, UsedNonce, UserPosition};
use crate::utils::verify_signed_quote;

#[derive(Accounts)]
#[instruction(quote: SignedQuote)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        init,
        payer = user,
        space = 8 + UsedNonce::INIT_SPACE,
        seeds = [NONCE_SEED, &quote.nonce],
        bump,
    )]
    pub used_nonce: Account<'info, UsedNonce>,

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

    /// CHECK: Address-checked instructions sysvar used for ed25519 introspection.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<PlaceOrder>, quote: SignedQuote) -> Result<()> {
    let clock = Clock::get()?;

    verify_signed_quote(
        &ctx.accounts.instructions_sysvar.to_account_info(),
        &ctx.accounts.config.quote_signer,
        &quote,
    )?;

    require!(
        quote.expires_at > clock.unix_timestamp,
        SolMarketError::QuoteExpired
    );
    require!(
        quote.market == ctx.accounts.market.key(),
        SolMarketError::MarketMismatch
    );
    require!(
        matches!(ctx.accounts.market.status, MarketStatus::Open),
        SolMarketError::MarketClosed
    );
    require!(!ctx.accounts.market.paused, SolMarketError::MarketPaused);
    require!(
        clock.unix_timestamp < ctx.accounts.market.end_time,
        SolMarketError::MarketEnded
    );
    require!(
        quote.outcome == OUTCOME_YES || quote.outcome == OUTCOME_NO,
        SolMarketError::InvalidOutcome
    );
    require!(
        quote.side == SIDE_BUY || quote.side == SIDE_SELL,
        SolMarketError::InvalidSide
    );
    require!(
        quote.price > 0 && quote.price < 100,
        SolMarketError::InvalidPrice
    );
    require!(quote.size > 0, SolMarketError::InvalidSize);

    let used_nonce = &mut ctx.accounts.used_nonce;
    used_nonce.nonce = quote.nonce;
    used_nonce.bump = ctx.bumps.used_nonce;

    let market_key = ctx.accounts.market.key();
    let user_key = ctx.accounts.user.key();
    let user_position = &mut ctx.accounts.user_position;
    if user_position.user == Pubkey::default() {
        user_position.user = user_key;
        user_position.market = market_key;
        user_position.bump = ctx.bumps.user_position;
    }

    let usdc_amount = (quote.price as u64)
        .checked_mul(USDC_PER_CENT)
        .ok_or(SolMarketError::MathOverflow)?
        .checked_mul(quote.size)
        .ok_or(SolMarketError::MathOverflow)?;

    match quote.side {
        SIDE_BUY => {
            let cpi_accounts = Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.treasury_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
            );
            token::transfer(cpi_ctx, usdc_amount)?;

            let market = &mut ctx.accounts.market;
            if quote.outcome == OUTCOME_YES {
                user_position.yes_shares = user_position
                    .yes_shares
                    .checked_add(quote.size)
                    .ok_or(SolMarketError::MathOverflow)?;
                market.total_yes = market
                    .total_yes
                    .checked_add(quote.size)
                    .ok_or(SolMarketError::MathOverflow)?;
            } else {
                user_position.no_shares = user_position
                    .no_shares
                    .checked_add(quote.size)
                    .ok_or(SolMarketError::MathOverflow)?;
                market.total_no = market
                    .total_no
                    .checked_add(quote.size)
                    .ok_or(SolMarketError::MathOverflow)?;
            }
        }
        SIDE_SELL => {
            {
                let market = &mut ctx.accounts.market;
                if quote.outcome == OUTCOME_YES {
                    user_position.yes_shares = user_position
                        .yes_shares
                        .checked_sub(quote.size)
                        .ok_or(SolMarketError::InsufficientShares)?;
                    market.total_yes = market
                        .total_yes
                        .checked_sub(quote.size)
                        .ok_or(SolMarketError::MathOverflow)?;
                } else {
                    user_position.no_shares = user_position
                        .no_shares
                        .checked_sub(quote.size)
                        .ok_or(SolMarketError::InsufficientShares)?;
                    market.total_no = market
                        .total_no
                        .checked_sub(quote.size)
                        .ok_or(SolMarketError::MathOverflow)?;
                }
            }

            let authority_bump = ctx.accounts.config.treasury_authority_bump;
            let signer_seeds: &[&[&[u8]]] =
                &[&[TREASURY_AUTHORITY_SEED, &[authority_bump]]];
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
            token::transfer(cpi_ctx, usdc_amount)?;
        }
        _ => return err!(SolMarketError::InvalidSide),
    }

    emit!(OrderFilled {
        user: user_key,
        market: market_key,
        polymarket_market_id: ctx.accounts.market.polymarket_market_id.clone(),
        side: quote.side,
        outcome: quote.outcome,
        size: quote.size,
        price: quote.price,
        nonce: quote.nonce,
    });

    Ok(())
}
