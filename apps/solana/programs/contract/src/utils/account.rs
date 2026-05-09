use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::AccountInfo,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    system_program,
    sysvar::Sysvar,
};

use crate::constants::ANCHOR_DISCRIMINATOR_LEN;

pub fn assert_signer(ai: &AccountInfo) -> Result<(), ProgramError> {
    if !ai.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    Ok(())
}

pub fn assert_writable(ai: &AccountInfo) -> Result<(), ProgramError> {
    if !ai.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

pub fn assert_owned_by(ai: &AccountInfo, owner: &Pubkey) -> Result<(), ProgramError> {
    if ai.owner != owner {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

pub fn assert_address(ai: &AccountInfo, expected: &Pubkey) -> Result<(), ProgramError> {
    if ai.key != expected {
        return Err(ProgramError::InvalidArgument);
    }
    Ok(())
}

/// Verifies that `account.key` was derived from `seeds + [bump]` under `program_id`.
/// Mirrors Anchor's `seeds = [...] bump = <stored_bump>` constraint, which uses
/// the cheaper `create_program_address` rather than re-running `find_program_address`.
pub fn assert_pda(
    account: &AccountInfo,
    seeds: &[&[u8]],
    bump: u8,
    program_id: &Pubkey,
) -> Result<(), ProgramError> {
    let mut full: Vec<&[u8]> = seeds.to_vec();
    let bump_bytes = [bump];
    full.push(&bump_bytes);
    let expected = Pubkey::create_program_address(&full, program_id)
        .map_err(|_| ProgramError::InvalidSeeds)?;
    if account.key != &expected {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(())
}

/// Reads `[8-byte disc][borsh body]` from the account data and returns the deserialized body.
/// Verifies the discriminator matches and that the account is owned by the expected program.
pub fn load_account<T: BorshDeserialize>(
    info: &AccountInfo,
    expected_disc: &[u8; 8],
) -> Result<T, ProgramError> {
    let data = info.data.borrow();
    if data.len() < ANCHOR_DISCRIMINATOR_LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    if &data[..ANCHOR_DISCRIMINATOR_LEN] != expected_disc {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut slice = &data[ANCHOR_DISCRIMINATOR_LEN..];
    T::deserialize(&mut slice).map_err(|_| ProgramError::InvalidAccountData)
}

/// Writes the discriminator + borsh body into the account data, leaving any trailing
/// bytes (from over-allocated max-string accounts) as-is. Borsh deserialization stops
/// after consuming what it needs, so the trailing bytes are inert.
pub fn save_account<T: BorshSerialize>(
    info: &AccountInfo,
    disc: &[u8; 8],
    value: &T,
) -> Result<(), ProgramError> {
    let body = borsh::to_vec(value).map_err(|_| ProgramError::InvalidAccountData)?;
    let mut data = info.data.borrow_mut();
    if data.len() < ANCHOR_DISCRIMINATOR_LEN + body.len() {
        return Err(ProgramError::AccountDataTooSmall);
    }
    data[..ANCHOR_DISCRIMINATOR_LEN].copy_from_slice(disc);
    data[ANCHOR_DISCRIMINATOR_LEN..ANCHOR_DISCRIMINATOR_LEN + body.len()].copy_from_slice(&body);
    Ok(())
}

/// Allocates a rent-exempt PDA owned by `new_owner`, paying lamports from `payer`.
/// `signer_seeds` must include the bump as the final element.
pub fn create_pda_account<'info>(
    payer: &AccountInfo<'info>,
    target: &AccountInfo<'info>,
    system_program_ai: &AccountInfo<'info>,
    space: u64,
    new_owner: &Pubkey,
    signer_seeds: &[&[u8]],
) -> Result<(), ProgramError> {
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(space as usize);
    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            target.key,
            lamports,
            space,
            new_owner,
        ),
        &[payer.clone(), target.clone(), system_program_ai.clone()],
        &[signer_seeds],
    )?;
    Ok(())
}

/// Closes a program-owned account, mirroring Anchor's `#[account(close = X)]` exactly:
/// drain lamports to `dest`, reassign owner to the system program, then realloc data to 0.
/// The runtime garbage-collects the account at end-of-tx because lamports == 0.
pub fn close_account(account: &AccountInfo, dest: &AccountInfo) -> Result<(), ProgramError> {
    let lamports = account.lamports();
    let dest_new = dest
        .lamports()
        .checked_add(lamports)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    **dest.lamports.borrow_mut() = dest_new;
    **account.lamports.borrow_mut() = 0;
    account.assign(&system_program::ID);
    account.resize(0)?;
    Ok(())
}

/// Returns true if the account currently looks freshly-allocated (system-owned, empty),
/// false if it's already a program-owned data account. Used to drive `init_if_needed`.
pub fn is_uninitialized(account: &AccountInfo) -> bool {
    account.owner == &system_program::ID && account.lamports() == 0
}
