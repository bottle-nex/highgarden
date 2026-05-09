use solana_program::{
    account_info::{next_account_info, AccountInfo},
    program::invoke_signed,
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
};
use spl_token::state::Account as SplTokenAccount;

use crate::constants::{
    CONFIG_SEED, OUTCOME_NO, OUTCOME_YES, POSITION_SEED, TREASURY_AUTHORITY_SEED,
    USDC_DECIMALS_MULTIPLIER,
};
use crate::errors::SolMarketError;
use crate::events::Claimed;
use crate::state::{Config, Market, MarketStatus, UserPosition};
use crate::utils::account::{
    assert_address, assert_owned_by, assert_pda, assert_signer, assert_writable,
};

/// Accounts:
///   0. user                (signer, writable)
///   1. config              (read-only)
///   2. market              (read-only)
///   3. user_position       (writable, PDA, has_one user, has_one market)
///   4. user_usdc           (writable, owner=user, mint=config.usdc_mint)
///   5. treasury_vault      (writable, address=config.treasury_vault)
///   6. treasury_authority  (read-only PDA)
///   7. token_program
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> Result<(), ProgramError> {
    let iter = &mut accounts.iter();
    let user = next_account_info(iter)?;
    let config_ai = next_account_info(iter)?;
    let market_ai = next_account_info(iter)?;
    let user_position_ai = next_account_info(iter)?;
    let user_usdc = next_account_info(iter)?;
    let treasury_vault = next_account_info(iter)?;
    let treasury_authority = next_account_info(iter)?;
    let token_program = next_account_info(iter)?;

    assert_signer(user)?;
    assert_writable(user)?;
    assert_address(token_program, &spl_token::ID)?;

    // Config + treasury authority
    assert_owned_by(config_ai, program_id)?;
    let config = Config::load(config_ai)?;
    assert_pda(config_ai, &[CONFIG_SEED], config.bump, program_id)?;
    assert_pda(
        treasury_authority,
        &[TREASURY_AUTHORITY_SEED],
        config.treasury_authority_bump,
        program_id,
    )?;
    assert_address(treasury_vault, &config.treasury_vault)?;

    // Market must be resolved with a winning outcome
    assert_owned_by(market_ai, program_id)?;
    let market = Market::load(market_ai)?;
    if !matches!(market.status, MarketStatus::Resolved) {
        return Err(SolMarketError::MarketNotResolved.into());
    }
    let winning = market
        .winning_outcome
        .ok_or(SolMarketError::MarketNotResolved)?;

    // User position PDA tied to (user, market)
    assert_owned_by(user_position_ai, program_id)?;
    assert_writable(user_position_ai)?;
    let mut position = UserPosition::load(user_position_ai)?;
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

    // User USDC ownership/mint
    assert_owned_by(user_usdc, &spl_token::ID)?;
    {
        let data = user_usdc.data.borrow();
        let acct = SplTokenAccount::unpack(&data)
            .map_err(|_| ProgramError::from(SolMarketError::Unauthorized))?;
        if acct.owner != *user.key {
            return Err(SolMarketError::Unauthorized.into());
        }
        if acct.mint != config.usdc_mint {
            return Err(SolMarketError::Unauthorized.into());
        }
    }

    // Drain the winning side, leave the losing side untouched
    let shares = match winning {
        OUTCOME_YES => {
            let s = position.yes_shares;
            position.yes_shares = 0;
            s
        }
        OUTCOME_NO => {
            let s = position.no_shares;
            position.no_shares = 0;
            s
        }
        _ => return Err(SolMarketError::InvalidOutcome.into()),
    };
    if shares == 0 {
        return Err(SolMarketError::NoWinningShares.into());
    }

    let payout = shares
        .checked_mul(USDC_DECIMALS_MULTIPLIER)
        .ok_or(SolMarketError::MathOverflow)?;

    // treasury_vault → user_usdc, signed by treasury_authority PDA
    let ix = spl_token::instruction::transfer(
        &spl_token::ID,
        treasury_vault.key,
        user_usdc.key,
        treasury_authority.key,
        &[],
        payout,
    )?;
    invoke_signed(
        &ix,
        &[
            treasury_vault.clone(),
            user_usdc.clone(),
            treasury_authority.clone(),
            token_program.clone(),
        ],
        &[&[TREASURY_AUTHORITY_SEED, &[config.treasury_authority_bump]]],
    )?;

    position.save(user_position_ai)?;

    Claimed {
        user: *user.key,
        market: *market_ai.key,
        outcome: winning,
        shares,
        payout,
    }
    .emit()?;

    Ok(())
}
