use solana_program::{
    account_info::{next_account_info, AccountInfo},
    program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::constants::{CONFIG_SEED, OUTCOME_NO, OUTCOME_YES, POSITION_SEED};
use crate::errors::SolMarketError;
use crate::events::PositionClosed;
use crate::state::{Config, Market, MarketStatus, UserPosition};
use crate::utils::account::{
    assert_owned_by, assert_pda, assert_signer, assert_writable, close_account,
};

/// Closes a user_position PDA after the market resolved and any winning shares are claimed.
/// Refunds rent to `fee_payer`. Losing-side shares are silently discarded; winning-side
/// shares MUST be zero, so we don't accidentally let the user forfeit unclaimed winnings.
///
/// Accounts:
///   0. user           (signer)
///   1. fee_payer      (signer, writable)  — receives reclaimed rent
///   2. config         (read-only)
///   3. market         (read-only)
///   4. user_position  (writable, PDA, has_one user, has_one market)
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> Result<(), ProgramError> {
    let iter = &mut accounts.iter();
    let user = next_account_info(iter)?;
    let fee_payer = next_account_info(iter)?;
    let config_ai = next_account_info(iter)?;
    let market_ai = next_account_info(iter)?;
    let user_position_ai = next_account_info(iter)?;

    assert_signer(user)?;
    assert_signer(fee_payer)?;
    assert_writable(fee_payer)?;

    assert_owned_by(config_ai, program_id)?;
    let config = Config::load(config_ai)?;
    assert_pda(config_ai, &[CONFIG_SEED], config.bump, program_id)?;

    assert_owned_by(market_ai, program_id)?;
    let market = Market::load(market_ai)?;

    if !matches!(market.status, MarketStatus::Resolved) {
        return Err(SolMarketError::MarketNotResolved.into());
    }
    let winning = market
        .winning_outcome
        .ok_or(SolMarketError::MarketNotResolved)?;

    assert_owned_by(user_position_ai, program_id)?;
    assert_writable(user_position_ai)?;
    let position = UserPosition::load(user_position_ai)?;
    assert_pda(
        user_position_ai,
        &[POSITION_SEED, user.key.as_ref(), market_ai.key.as_ref()],
        position.bump,
        program_id,
    )?;
    if position.user != *user.key {
        return Err(SolMarketError::Unauthorized.into());
    }
    if position.market != *market_ai.key {
        return Err(SolMarketError::MarketMismatch.into());
    }

    let winning_balance = match winning {
        OUTCOME_YES => position.yes_shares,
        OUTCOME_NO => position.no_shares,
        _ => return Err(SolMarketError::InvalidOutcome.into()),
    };
    if winning_balance != 0 {
        return Err(SolMarketError::WinningSharesUnclaimed.into());
    }

    close_account(user_position_ai, fee_payer)?;

    PositionClosed {
        user: *user.key,
        market: *market_ai.key,
        rent_recipient: *fee_payer.key,
    }
    .emit()?;

    Ok(())
}
