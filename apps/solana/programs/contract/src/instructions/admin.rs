use solana_program::{
    account_info::{next_account_info, AccountInfo},
    program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::constants::{CONFIG_SEED, MARKET_SEED};
use crate::errors::SolMarketError;
use crate::state::{Config, Market};
use crate::utils::account::{assert_owned_by, assert_pda, assert_signer, assert_writable};

/// Accounts:
///   0. config  (read-only, has_one admin)
///   1. admin   (signer)
///   2. market  (writable, PDA[MARKET_SEED, market.polymarket_market_id_hash])
pub fn pause(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> Result<(), ProgramError> {
    set_paused(program_id, accounts, true)
}

pub fn unpause(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> Result<(), ProgramError> {
    set_paused(program_id, accounts, false)
}

fn set_paused(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    paused: bool,
) -> Result<(), ProgramError> {
    let iter = &mut accounts.iter();
    let config_ai = next_account_info(iter)?;
    let admin = next_account_info(iter)?;
    let market_ai = next_account_info(iter)?;

    assert_signer(admin)?;

    assert_owned_by(config_ai, program_id)?;
    let config = Config::load(config_ai)?;
    assert_pda(config_ai, &[CONFIG_SEED], config.bump, program_id)?;
    if config.admin != *admin.key {
        return Err(SolMarketError::Unauthorized.into());
    }

    assert_owned_by(market_ai, program_id)?;
    assert_writable(market_ai)?;
    let mut market = Market::load(market_ai)?;
    assert_pda(
        market_ai,
        &[MARKET_SEED, market.polymarket_market_id_hash.as_ref()],
        market.bump,
        program_id,
    )?;

    market.paused = paused;
    market.save(market_ai)?;
    Ok(())
}
