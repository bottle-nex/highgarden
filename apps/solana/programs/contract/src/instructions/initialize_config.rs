use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    program::invoke_signed,
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    system_program,
    sysvar::Sysvar,
};
use spl_token::state::Account as SplTokenAccount;

use crate::constants::{
    ANCHOR_DISCRIMINATOR_LEN, CONFIG_SEED, TREASURY_AUTHORITY_SEED, TREASURY_VAULT_SEED,
};
use crate::state::Config;
use crate::utils::account::{
    assert_address, assert_owned_by, assert_signer, assert_writable,
};

#[derive(BorshDeserialize)]
struct Args {
    oracle_signer: Pubkey,
    quote_signer: Pubkey,
}

/// Accounts (in order, matching the original `InitializeConfig` Anchor context):
///   0. admin                (signer, writable)        — pays rent for config + vault
///   1. config               (writable)                — PDA, init
///   2. treasury_authority   (read-only)               — PDA, used as token-account authority
///   3. treasury_vault       (writable)                — PDA, init as USDC token account
///   4. usdc_mint            (read-only)
///   5. token_program        (read-only)
///   6. system_program       (read-only)
///   7. rent                 (read-only)               — kept for parity with the Anchor IDL
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> Result<(), ProgramError> {
    let args = Args::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    let iter = &mut accounts.iter();
    let admin = next_account_info(iter)?;
    let config = next_account_info(iter)?;
    let treasury_authority = next_account_info(iter)?;
    let treasury_vault = next_account_info(iter)?;
    let usdc_mint = next_account_info(iter)?;
    let token_program = next_account_info(iter)?;
    let system_program_ai = next_account_info(iter)?;
    let _rent_sysvar = next_account_info(iter)?;

    assert_signer(admin)?;
    assert_writable(admin)?;
    assert_address(token_program, &spl_token::ID)?;
    assert_address(system_program_ai, &system_program::ID)?;

    // Derive PDAs and bumps for the three program-controlled accounts.
    let (config_pda, config_bump) = Pubkey::find_program_address(&[CONFIG_SEED], program_id);
    let (treasury_authority_pda, treasury_authority_bump) =
        Pubkey::find_program_address(&[TREASURY_AUTHORITY_SEED], program_id);
    let (treasury_vault_pda, treasury_vault_bump) =
        Pubkey::find_program_address(&[TREASURY_VAULT_SEED], program_id);

    if config.key != &config_pda {
        return Err(ProgramError::InvalidSeeds);
    }
    if treasury_authority.key != &treasury_authority_pda {
        return Err(ProgramError::InvalidSeeds);
    }
    if treasury_vault.key != &treasury_vault_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let rent = Rent::get()?;

    // ── Allocate the Config PDA ─────────────────────────────────────────────
    let config_space = ANCHOR_DISCRIMINATOR_LEN + Config::SPACE;
    invoke_signed(
        &system_instruction::create_account(
            admin.key,
            config.key,
            rent.minimum_balance(config_space),
            config_space as u64,
            program_id,
        ),
        &[admin.clone(), config.clone(), system_program_ai.clone()],
        &[&[CONFIG_SEED, &[config_bump]]],
    )?;

    // ── Allocate the treasury vault PDA owned by the SPL Token program ──────
    let vault_space = SplTokenAccount::LEN;
    invoke_signed(
        &system_instruction::create_account(
            admin.key,
            treasury_vault.key,
            rent.minimum_balance(vault_space),
            vault_space as u64,
            &spl_token::ID,
        ),
        &[
            admin.clone(),
            treasury_vault.clone(),
            system_program_ai.clone(),
        ],
        &[&[TREASURY_VAULT_SEED, &[treasury_vault_bump]]],
    )?;

    // ── Initialize the vault as a USDC token account owned by treasury_authority ──
    let init_ix = spl_token::instruction::initialize_account3(
        &spl_token::ID,
        treasury_vault.key,
        usdc_mint.key,
        treasury_authority.key,
    )?;
    solana_program::program::invoke(
        &init_ix,
        &[
            treasury_vault.clone(),
            usdc_mint.clone(),
            token_program.clone(),
        ],
    )?;

    // ── Persist the Config state ────────────────────────────────────────────
    let cfg = Config {
        admin: *admin.key,
        oracle_signer: args.oracle_signer,
        quote_signer: args.quote_signer,
        treasury_vault: *treasury_vault.key,
        usdc_mint: *usdc_mint.key,
        treasury_authority_bump,
        treasury_vault_bump,
        bump: config_bump,
    };

    // Owner is now `program_id` after create_account; persist the discriminator + body.
    assert_owned_by(config, program_id)?;
    cfg.save(config)?;

    Ok(())
}
