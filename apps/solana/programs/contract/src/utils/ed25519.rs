use solana_program::{
    account_info::AccountInfo,
    ed25519_program,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};

use crate::errors::SolMarketError;
use crate::state::SignedQuote;

const ED25519_HEADER_LEN: usize = 2;
const ED25519_OFFSETS_LEN: usize = 14;
const ED25519_DATA_START: usize = ED25519_HEADER_LEN + ED25519_OFFSETS_LEN;
const ED25519_PUBKEY_LEN: usize = 32;
const ED25519_SIGNATURE_LEN: usize = 64;

/// Verifies that the immediately preceding instruction in the current transaction is a
/// call to the Ed25519 native program proving `expected_signer` signed the borsh-serialized
/// `quote`. Logic is a 1:1 port of the original Anchor implementation.
pub fn verify_signed_quote(
    instructions_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    quote: &SignedQuote,
) -> Result<(), ProgramError> {
    let current_index = load_current_index_checked(instructions_sysvar)
        .map_err(|_| ProgramError::from(SolMarketError::MissingSignature))?
        as usize;
    if current_index == 0 {
        return Err(SolMarketError::MissingSignature.into());
    }

    let ed25519_ix = load_instruction_at_checked(current_index - 1, instructions_sysvar)
        .map_err(|_| ProgramError::from(SolMarketError::MissingSignature))?;

    if ed25519_ix.program_id != ed25519_program::ID {
        return Err(SolMarketError::InvalidSignature.into());
    }

    let data = ed25519_ix.data.as_slice();
    if data.len() < ED25519_DATA_START {
        return Err(SolMarketError::InvalidSignature.into());
    }

    let num_signatures = data[0];
    let padding = data[1];
    if num_signatures != 1 || padding != 0 {
        return Err(SolMarketError::InvalidSignature.into());
    }

    let signature_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
    let signature_instruction_index = u16::from_le_bytes([data[4], data[5]]);
    let public_key_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let public_key_instruction_index = u16::from_le_bytes([data[8], data[9]]);
    let message_data_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_data_size = u16::from_le_bytes([data[12], data[13]]) as usize;
    let message_instruction_index = u16::from_le_bytes([data[14], data[15]]);

    if signature_instruction_index != u16::MAX
        || public_key_instruction_index != u16::MAX
        || message_instruction_index != u16::MAX
    {
        return Err(SolMarketError::InvalidSignature.into());
    }

    let pubkey_end = public_key_offset
        .checked_add(ED25519_PUBKEY_LEN)
        .ok_or(SolMarketError::InvalidSignature)?;
    let signature_end = signature_offset
        .checked_add(ED25519_SIGNATURE_LEN)
        .ok_or(SolMarketError::InvalidSignature)?;
    let message_end = message_data_offset
        .checked_add(message_data_size)
        .ok_or(SolMarketError::InvalidSignature)?;

    if data.len() < pubkey_end || data.len() < signature_end || data.len() < message_end {
        return Err(SolMarketError::InvalidSignature.into());
    }

    let pubkey_bytes = &data[public_key_offset..pubkey_end];
    if pubkey_bytes != expected_signer.as_ref() {
        return Err(SolMarketError::InvalidSignature.into());
    }

    let message_bytes = &data[message_data_offset..message_end];
    let expected_message = borsh::to_vec(quote)
        .map_err(|_| ProgramError::from(SolMarketError::InvalidSignature))?;
    if message_bytes != expected_message.as_slice() {
        return Err(SolMarketError::InvalidSignature.into());
    }

    Ok(())
}
