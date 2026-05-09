use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::constants::{CONFIG_SEED, MARKET_SEED, OUTCOME_NO, OUTCOME_YES};
use crate::errors::SolMarketError;
use crate::events::MarketResolved;
use crate::state::{Config, Market, MarketStatus};
use crate::utils::account::{
    assert_owned_by, assert_pda, assert_signer, assert_writable,
};

#[derive(BorshDeserialize)]
struct Args {
    winning_outcome: u8,
}

/// Accounts:
///   0. config         (read-only, PDA[CONFIG_SEED], has_one oracle_signer)
///   1. oracle_signer  (signer)
///   2. market         (writable, PDA[MARKET_SEED, market.polymarket_market_id_hash])
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> Result<(), ProgramError> {
    let args = Args::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    let iter = &mut accounts.iter();
    let config_ai = next_account_info(iter)?;
    let oracle_signer = next_account_info(iter)?;
    let market_ai = next_account_info(iter)?;

    assert_signer(oracle_signer)?;

    // Config + oracle authority
    assert_owned_by(config_ai, program_id)?;
    let config = Config::load(config_ai)?;
    assert_pda(config_ai, &[CONFIG_SEED], config.bump, program_id)?;
    if config.oracle_signer != *oracle_signer.key {
        return Err(SolMarketError::Unauthorized.into());
    }

    // Market PDA tied to its stored hash
    assert_owned_by(market_ai, program_id)?;
    assert_writable(market_ai)?;
    let mut market = Market::load(market_ai)?;
    assert_pda(
        market_ai,
        &[MARKET_SEED, market.polymarket_market_id_hash.as_ref()],
        market.bump,
        program_id,
    )?;

    if args.winning_outcome != OUTCOME_YES && args.winning_outcome != OUTCOME_NO {
        return Err(SolMarketError::InvalidOutcome.into());
    }
    if !matches!(market.status, MarketStatus::Open) {
        return Err(SolMarketError::MarketClosed.into());
    }

    market.status = MarketStatus::Resolved;
    market.winning_outcome = Some(args.winning_outcome);
    market.save(market_ai)?;

    MarketResolved {
        market: *market_ai.key,
        winning_outcome: args.winning_outcome,
    }
    .emit()?;

    Ok(())
}
