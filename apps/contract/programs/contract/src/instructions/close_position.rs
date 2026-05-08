use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, OUTCOME_NO, OUTCOME_YES, POSITION_SEED};
use crate::errors::SolMarketError;
use crate::events::PositionClosed;
use crate::state::{Config, Market, MarketStatus, UserPosition};

/// Closes a user_position PDA after the market has resolved and the user has
/// claimed any winning shares. Refunds the rent to `fee_payer` (the wallet
/// that paid for the PDA in the first place — admin under the gasless
/// trading model).
///
/// "Liberal close": losing-side shares are simply discarded when the account
/// is closed. The winning side, however, must be at zero — we don't want a
/// user to accidentally forfeit unclaimed winnings.
#[derive(Accounts)]
pub struct ClosePosition<'info> {
    /// The position owner. Must sign so users can't be force-closed.
    pub user: Signer<'info>,

    /// Receives the reclaimed rent. In the custodial gasless model this is
    /// the admin/platform wallet, since admin paid the rent at PDA creation.
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    pub market: Account<'info, Market>,

    #[account(
        mut,
        close = fee_payer,
        seeds = [POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump,
        has_one = user @ SolMarketError::Unauthorized,
        has_one = market @ SolMarketError::MarketMismatch,
    )]
    pub user_position: Account<'info, UserPosition>,
}

pub fn handler(ctx: Context<ClosePosition>) -> Result<()> {
    let market = &ctx.accounts.market;
    require!(
        matches!(market.status, MarketStatus::Resolved),
        SolMarketError::MarketNotResolved,
    );
    let winning = market
        .winning_outcome
        .ok_or(SolMarketError::MarketNotResolved)?;

    // Refuse to close while the user still holds unclaimed winning shares.
    // Losing-side shares are worthless — we let those silently disappear.
    let winning_balance = match winning {
        OUTCOME_YES => ctx.accounts.user_position.yes_shares,
        OUTCOME_NO => ctx.accounts.user_position.no_shares,
        _ => return err!(SolMarketError::InvalidOutcome),
    };
    require!(
        winning_balance == 0,
        SolMarketError::WinningSharesUnclaimed,
    );

    emit!(PositionClosed {
        user: ctx.accounts.user.key(),
        market: market.key(),
        rent_recipient: ctx.accounts.fee_payer.key(),
    });

    Ok(())
}
