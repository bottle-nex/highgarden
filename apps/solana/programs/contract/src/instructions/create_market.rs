use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    hash::hash,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    system_program,
    sysvar::Sysvar,
};

use crate::constants::{
    ANCHOR_DISCRIMINATOR_LEN, CONFIG_SEED, MARKET_SEED, MAX_POLYMARKET_ID_LEN, MAX_TOKEN_ID_LEN,
};
use crate::errors::SolMarketError;
use crate::state::{Config, Market, MarketStatus};
use crate::utils::account::{
    assert_address, assert_owned_by, assert_pda, assert_signer, assert_writable,
};

#[derive(BorshDeserialize)]
struct Args {
    polymarket_market_id_hash: [u8; 32],
    polymarket_market_id: String,
    question_hash: [u8; 32],
    end_time: i64,
    tick_size: u16,
    yes_token_id: String,
    no_token_id: String,
}

/// Accounts:
///   0. admin            (signer, writable)
///   1. config           (read-only, PDA[CONFIG_SEED])
///   2. market           (writable, PDA[MARKET_SEED, polymarket_market_id_hash], init)
///   3. system_program
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> Result<(), ProgramError> {
    let args = Args::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    let iter = &mut accounts.iter();
    let admin = next_account_info(iter)?;
    let config_ai = next_account_info(iter)?;
    let market_ai = next_account_info(iter)?;
    let system_program_ai = next_account_info(iter)?;

    assert_signer(admin)?;
    assert_writable(admin)?;
    assert_address(system_program_ai, &system_program::ID)?;

    // Verify config PDA + admin authority (Anchor `has_one = admin`).
    assert_owned_by(config_ai, program_id)?;
    let config = Config::load(config_ai)?;
    assert_pda(config_ai, &[CONFIG_SEED], config.bump, program_id)?;
    if config.admin != *admin.key {
        return Err(SolMarketError::Unauthorized.into());
    }

    // Validate args ─────────────────────────────────────────────────────────
    if args.polymarket_market_id.as_bytes().len() > MAX_POLYMARKET_ID_LEN {
        return Err(SolMarketError::InvalidMarketId.into());
    }
    if args.yes_token_id.as_bytes().len() > MAX_TOKEN_ID_LEN
        || args.no_token_id.as_bytes().len() > MAX_TOKEN_ID_LEN
    {
        return Err(SolMarketError::InvalidMarketId.into());
    }

    let computed = hash(args.polymarket_market_id.as_bytes()).to_bytes();
    if computed != args.polymarket_market_id_hash {
        return Err(SolMarketError::InvalidMarketId.into());
    }

    let clock = Clock::get()?;
    if args.end_time <= clock.unix_timestamp {
        return Err(SolMarketError::MarketEnded.into());
    }
    if args.tick_size == 0 {
        return Err(SolMarketError::InvalidPrice.into());
    }

    // Allocate the Market PDA ───────────────────────────────────────────────
    let (market_pda, market_bump) = Pubkey::find_program_address(
        &[MARKET_SEED, args.polymarket_market_id_hash.as_ref()],
        program_id,
    );
    if market_ai.key != &market_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let space = ANCHOR_DISCRIMINATOR_LEN + Market::SPACE;
    let rent = Rent::get()?;
    invoke_signed(
        &system_instruction::create_account(
            admin.key,
            market_ai.key,
            rent.minimum_balance(space),
            space as u64,
            program_id,
        ),
        &[admin.clone(), market_ai.clone(), system_program_ai.clone()],
        &[&[
            MARKET_SEED,
            args.polymarket_market_id_hash.as_ref(),
            &[market_bump],
        ]],
    )?;

    // Persist the Market state ──────────────────────────────────────────────
    let market = Market {
        polymarket_market_id: args.polymarket_market_id,
        polymarket_market_id_hash: args.polymarket_market_id_hash,
        question_hash: args.question_hash,
        end_time: args.end_time,
        tick_size: args.tick_size,
        yes_token_id: args.yes_token_id,
        no_token_id: args.no_token_id,
        status: MarketStatus::Open,
        winning_outcome: None,
        total_yes: 0,
        total_no: 0,
        paused: false,
        bump: market_bump,
    };
    market.save(market_ai)?;

    Ok(())
}
