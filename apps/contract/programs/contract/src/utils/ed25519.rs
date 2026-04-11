use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};

use crate::errors::SolMarketError;
use crate::state::SignedQuote;

const ED25519_HEADER_LEN: usize = 2;
const ED25519_OFFSETS_LEN: usize = 14;
const ED25519_DATA_START: usize = ED25519_HEADER_LEN + ED25519_OFFSETS_LEN;
const ED25519_PUBKEY_LEN: usize = 32;
const ED25519_SIGNATURE_LEN: usize = 64;

/// Verifies that the previous instruction in the current transaction is a
/// call to the Ed25519 native program that proves `expected_signer` signed
/// the borsh-serialized `quote`.
pub fn verify_signed_quote(
    instructions_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    quote: &SignedQuote,
) -> Result<()> {
    let current_index = load_current_index_checked(instructions_sysvar)? as usize;
    require!(current_index > 0, SolMarketError::MissingSignature);

    let ed25519_ix = load_instruction_at_checked(current_index - 1, instructions_sysvar)
        .map_err(|_| error!(SolMarketError::MissingSignature))?;

    require_keys_eq!(
        ed25519_ix.program_id,
        ed25519_program::ID,
        SolMarketError::InvalidSignature
    );

    let data = ed25519_ix.data.as_slice();
    require!(
        data.len() >= ED25519_DATA_START,
        SolMarketError::InvalidSignature
    );

    let num_signatures = data[0];
    let padding = data[1];
    require!(
        num_signatures == 1 && padding == 0,
        SolMarketError::InvalidSignature
    );

    let signature_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
    let signature_instruction_index = u16::from_le_bytes([data[4], data[5]]);
    let public_key_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let public_key_instruction_index = u16::from_le_bytes([data[8], data[9]]);
    let message_data_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_data_size = u16::from_le_bytes([data[12], data[13]]) as usize;
    let message_instruction_index = u16::from_le_bytes([data[14], data[15]]);

    require!(
        signature_instruction_index == u16::MAX
            && public_key_instruction_index == u16::MAX
            && message_instruction_index == u16::MAX,
        SolMarketError::InvalidSignature
    );

    let pubkey_end = public_key_offset
        .checked_add(ED25519_PUBKEY_LEN)
        .ok_or(error!(SolMarketError::InvalidSignature))?;
    let signature_end = signature_offset
        .checked_add(ED25519_SIGNATURE_LEN)
        .ok_or(error!(SolMarketError::InvalidSignature))?;
    let message_end = message_data_offset
        .checked_add(message_data_size)
        .ok_or(error!(SolMarketError::InvalidSignature))?;

    require!(
        data.len() >= pubkey_end
            && data.len() >= signature_end
            && data.len() >= message_end,
        SolMarketError::InvalidSignature
    );

    let pubkey_bytes = &data[public_key_offset..pubkey_end];
    require!(
        pubkey_bytes == expected_signer.as_ref(),
        SolMarketError::InvalidSignature
    );

    let message_bytes = &data[message_data_offset..message_end];
    let expected_message = quote
        .try_to_vec()
        .map_err(|_| error!(SolMarketError::InvalidSignature))?;
    require!(
        message_bytes == expected_message.as_slice(),
        SolMarketError::InvalidSignature
    );

    Ok(())
}
