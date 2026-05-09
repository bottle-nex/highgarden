use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::constants::{CONFIG_SEED, NONCE_SEED};
use crate::errors::SolMarketError;
use crate::state::{Config, UsedNonce};
use crate::utils::account::{
    assert_owned_by, assert_pda, assert_signer, assert_writable, close_account,
};

#[derive(BorshDeserialize)]
struct Args {
    nonce: [u8; 16],
}

/// Reclaims rent from a `UsedNonce` PDA. Admin-only — the platform is trusted to only
/// close nonces whose corresponding quote has already expired. Even if a closed nonce
/// were re-created and replayed, `place_order`'s expiry check would still reject it.
///
/// Accounts:
///   0. admin        (signer, writable, address=config.admin)
///   1. config       (read-only)
///   2. used_nonce   (writable, PDA[NONCE_SEED, nonce])
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
    let used_nonce_ai = next_account_info(iter)?;

    assert_signer(admin)?;
    assert_writable(admin)?;

    assert_owned_by(config_ai, program_id)?;
    let config = Config::load(config_ai)?;
    assert_pda(config_ai, &[CONFIG_SEED], config.bump, program_id)?;
    if config.admin != *admin.key {
        return Err(SolMarketError::Unauthorized.into());
    }

    assert_owned_by(used_nonce_ai, program_id)?;
    assert_writable(used_nonce_ai)?;
    let used = UsedNonce::load(used_nonce_ai)?;
    assert_pda(
        used_nonce_ai,
        &[NONCE_SEED, &args.nonce],
        used.bump,
        program_id,
    )?;
    if used.nonce != args.nonce {
        return Err(ProgramError::InvalidArgument);
    }

    close_account(used_nonce_ai, admin)?;
    Ok(())
}
