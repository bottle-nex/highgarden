//! SolMarket — native Solana program (no Anchor, no Pinocchio).
//!
//! This is a 1:1 port of the original Anchor program at `apps/contract/programs/contract`.
//! Wire format is preserved (same program ID, same Anchor-style 8-byte instruction/account/event
//! discriminators, same borsh layouts), so existing TypeScript clients continue to work.

#![allow(clippy::too_many_arguments)]

use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    pubkey::Pubkey,
};

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use crate::utils::discriminator::ix_disc;

solana_program::declare_id!("2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P");

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if instruction_data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let (disc_bytes, rest) = instruction_data.split_at(8);
    let disc: [u8; 8] = disc_bytes.try_into().unwrap();

    // Anchor-compatible dispatch by sha256("global:<snake_name>")[..8].
    if disc == ix_disc("initialize_config") {
        instructions::initialize_config::process(program_id, accounts, rest)
    } else if disc == ix_disc("create_market") {
        instructions::create_market::process(program_id, accounts, rest)
    } else if disc == ix_disc("place_order") {
        instructions::place_order::process(program_id, accounts, rest)
    } else if disc == ix_disc("resolve_market") {
        instructions::resolve_market::process(program_id, accounts, rest)
    } else if disc == ix_disc("claim") {
        instructions::claim::process(program_id, accounts, rest)
    } else if disc == ix_disc("close_position") {
        instructions::close_position::process(program_id, accounts, rest)
    } else if disc == ix_disc("close_used_nonce") {
        instructions::close_used_nonce::process(program_id, accounts, rest)
    } else if disc == ix_disc("admin_pause_market") {
        instructions::admin::pause(program_id, accounts, rest)
    } else if disc == ix_disc("admin_unpause_market") {
        instructions::admin::unpause(program_id, accounts, rest)
    } else {
        Err(ProgramError::InvalidInstructionData)
    }
}
