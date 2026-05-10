use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    system_program,
    sysvar::{instructions::ID as INSTRUCTIONS_SYSVAR_ID, Sysvar},
};
use spl_token::state::Account as SplTokenAccount;

use crate::constants::{
    ANCHOR_DISCRIMINATOR_LEN, CONFIG_SEED, NONCE_SEED, OUTCOME_NO, OUTCOME_YES, POSITION_SEED,
    SIDE_BUY, SIDE_SELL, TREASURY_AUTHORITY_SEED, USDC_PER_CENT,
};
use crate::errors::SolMarketError;
use crate::events::OrderFilled;
use crate::state::{Config, Market, MarketStatus, SignedQuote, UsedNonce, UserPosition};
use crate::utils::account::{
    assert_address, assert_owned_by, assert_pda, assert_signer, assert_writable, is_uninitialized,
};
use crate::utils::ed25519::verify_signed_quote;

/// Accounts:
///   0.  user                   (signer, writable)  — authorizes USDC transfer
///   1.  fee_payer              (signer, writable)  — pays SOL rent for new PDAs
///   2.  config                 (read-only)
///   3.  market                 (writable)
///   4.  user_position          (writable, init_if_needed)
///   5.  used_nonce             (writable, init)
///   6.  user_usdc              (writable, SPL token account)
///   7.  treasury_vault         (writable, SPL token account = config.treasury_vault)
///   8.  treasury_authority     (read-only PDA)
///   9.  instructions_sysvar    (read-only, address-checked)
///   10. token_program          (read-only)
///   11. system_program         (read-only)
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> Result<(), ProgramError> {
    let quote = SignedQuote::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    let iter = &mut accounts.iter();
    let user = next_account_info(iter)?;
    let fee_payer = next_account_info(iter)?;
    let config_ai = next_account_info(iter)?;
    let market_ai = next_account_info(iter)?;
    let user_position_ai = next_account_info(iter)?;
    let used_nonce_ai = next_account_info(iter)?;
    let user_usdc = next_account_info(iter)?;
    let treasury_vault = next_account_info(iter)?;
    let treasury_authority = next_account_info(iter)?;
    let instructions_sysvar = next_account_info(iter)?;
    let token_program = next_account_info(iter)?;
    let system_program_ai = next_account_info(iter)?;

    assert_signer(user)?;
    assert_writable(user)?;
    assert_signer(fee_payer)?;
    assert_writable(fee_payer)?;
    assert_address(token_program, &spl_token::ID)?;
    assert_address(system_program_ai, &system_program::ID)?;
    assert_address(instructions_sysvar, &INSTRUCTIONS_SYSVAR_ID)?;

    // ── Load config & verify PDA ─────────────────────────────────────────────
    assert_owned_by(config_ai, program_id)?;
    let config = Config::load(config_ai)?;
    assert_pda(config_ai, &[CONFIG_SEED], config.bump, program_id)?;
    assert_address(treasury_vault, &config.treasury_vault)?;
    assert_pda(
        treasury_authority,
        &[TREASURY_AUTHORITY_SEED],
        config.treasury_authority_bump,
        program_id,
    )?;

    // ── Verify the off-chain ed25519 quote signature ─────────────────────────
    verify_signed_quote(instructions_sysvar, &config.quote_signer, &quote)?;

    // ── Load market & validate state ────────────────────────────────────────
    assert_owned_by(market_ai, program_id)?;
    assert_writable(market_ai)?;
    let mut market = Market::load(market_ai)?;
    let market_key = *market_ai.key;

    let clock = Clock::get()?;
    if quote.expires_at <= clock.unix_timestamp {
        return Err(SolMarketError::QuoteExpired.into());
    }
    if quote.market != market_key {
        return Err(SolMarketError::MarketMismatch.into());
    }
    if !matches!(market.status, MarketStatus::Open) {
        return Err(SolMarketError::MarketClosed.into());
    }
    if market.paused {
        return Err(SolMarketError::MarketPaused.into());
    }
    if clock.unix_timestamp >= market.end_time {
        return Err(SolMarketError::MarketEnded.into());
    }
    if quote.outcome != OUTCOME_YES && quote.outcome != OUTCOME_NO {
        return Err(SolMarketError::InvalidOutcome.into());
    }
    if quote.side != SIDE_BUY && quote.side != SIDE_SELL {
        return Err(SolMarketError::InvalidSide.into());
    }
    if quote.price == 0 || quote.price >= 100 {
        return Err(SolMarketError::InvalidPrice.into());
    }
    if quote.size == 0 {
        return Err(SolMarketError::InvalidSize.into());
    }

    // ── Validate user USDC token account (owner + mint constraints) ─────────
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
    assert_owned_by(treasury_vault, &spl_token::ID)?;

    // ── Init the UsedNonce PDA — replay protection ──────────────────────────
    // System-program owned + zero lamports = fresh; otherwise nonce already used.
    if !is_uninitialized(used_nonce_ai) {
        return Err(SolMarketError::NonceUsed.into());
    }
    let (nonce_pda, nonce_bump) =
        Pubkey::find_program_address(&[NONCE_SEED, &quote.nonce], program_id);
    if used_nonce_ai.key != &nonce_pda {
        return Err(ProgramError::InvalidSeeds);
    }
    let nonce_space = ANCHOR_DISCRIMINATOR_LEN + UsedNonce::SPACE;
    let rent = Rent::get()?;
    invoke_signed(
        &system_instruction::create_account(
            fee_payer.key,
            used_nonce_ai.key,
            rent.minimum_balance(nonce_space),
            nonce_space as u64,
            program_id,
        ),
        &[
            fee_payer.clone(),
            used_nonce_ai.clone(),
            system_program_ai.clone(),
        ],
        &[&[NONCE_SEED, &quote.nonce, &[nonce_bump]]],
    )?;
    UsedNonce {
        nonce: quote.nonce,
        bump: nonce_bump,
    }
    .save(used_nonce_ai)?;

    // ── Init or load the UserPosition PDA ───────────────────────────────────
    let mut user_position = if is_uninitialized(user_position_ai) {
        let (position_pda, position_bump) = Pubkey::find_program_address(
            &[POSITION_SEED, user.key.as_ref(), market_key.as_ref()],
            program_id,
        );
        if user_position_ai.key != &position_pda {
            return Err(ProgramError::InvalidSeeds);
        }
        let space = ANCHOR_DISCRIMINATOR_LEN + UserPosition::SPACE;
        invoke_signed(
            &system_instruction::create_account(
                fee_payer.key,
                user_position_ai.key,
                rent.minimum_balance(space),
                space as u64,
                program_id,
            ),
            &[
                fee_payer.clone(),
                user_position_ai.clone(),
                system_program_ai.clone(),
            ],
            &[&[
                POSITION_SEED,
                user.key.as_ref(),
                market_key.as_ref(),
                &[position_bump],
            ]],
        )?;
        // Don't save here — the final `user_position.save(...)` at the end of the
        // handler will write the discriminator + the post-mutation body in one shot.
        UserPosition {
            user: *user.key,
            market: market_key,
            yes_shares: 0,
            no_shares: 0,
            bump: position_bump,
        }
    } else {
        assert_owned_by(user_position_ai, program_id)?;
        let pos = UserPosition::load(user_position_ai)?;
        assert_pda(
            user_position_ai,
            &[POSITION_SEED, user.key.as_ref(), market_key.as_ref()],
            pos.bump,
            program_id,
        )?;
        if pos.user != *user.key {
            return Err(SolMarketError::Unauthorized.into());
        }
        if pos.market != market_key {
            return Err(SolMarketError::MarketMismatch.into());
        }
        pos
    };
    assert_writable(user_position_ai)?;

    // ── Compute USDC amount and execute the side-specific transfer + bookkeeping ──
    let usdc_amount = (quote.price as u64)
        .checked_mul(USDC_PER_CENT)
        .ok_or(SolMarketError::MathOverflow)?
        .checked_mul(quote.size)
        .ok_or(SolMarketError::MathOverflow)?;

    match quote.side {
        SIDE_BUY => {
            // user → treasury_vault, signed by `user`
            let ix = spl_token::instruction::transfer(
                &spl_token::ID,
                user_usdc.key,
                treasury_vault.key,
                user.key,
                &[],
                usdc_amount,
            )?;
            invoke(
                &ix,
                &[
                    user_usdc.clone(),
                    treasury_vault.clone(),
                    user.clone(),
                    token_program.clone(),
                ],
            )?;

            if quote.outcome == OUTCOME_YES {
                user_position.yes_shares = user_position
                    .yes_shares
                    .checked_add(quote.size)
                    .ok_or(SolMarketError::MathOverflow)?;
                market.total_yes = market
                    .total_yes
                    .checked_add(quote.size)
                    .ok_or(SolMarketError::MathOverflow)?;
            } else {
                user_position.no_shares = user_position
                    .no_shares
                    .checked_add(quote.size)
                    .ok_or(SolMarketError::MathOverflow)?;
                market.total_no = market
                    .total_no
                    .checked_add(quote.size)
                    .ok_or(SolMarketError::MathOverflow)?;
            }
        }
        SIDE_SELL => {
            // bookkeeping first so we don't pay out unless the user actually owns the shares
            if quote.outcome == OUTCOME_YES {
                user_position.yes_shares = user_position
                    .yes_shares
                    .checked_sub(quote.size)
                    .ok_or(SolMarketError::InsufficientShares)?;
                market.total_yes = market
                    .total_yes
                    .checked_sub(quote.size)
                    .ok_or(SolMarketError::MathOverflow)?;
            } else {
                user_position.no_shares = user_position
                    .no_shares
                    .checked_sub(quote.size)
                    .ok_or(SolMarketError::InsufficientShares)?;
                market.total_no = market
                    .total_no
                    .checked_sub(quote.size)
                    .ok_or(SolMarketError::MathOverflow)?;
            }

            // treasury_vault → user, signed by treasury_authority PDA
            let ix = spl_token::instruction::transfer(
                &spl_token::ID,
                treasury_vault.key,
                user_usdc.key,
                treasury_authority.key,
                &[],
                usdc_amount,
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
        }
        _ => return Err(SolMarketError::InvalidSide.into()),
    }

    // ── Persist mutated state and emit ──────────────────────────────────────
    market.save(market_ai)?;
    user_position.save(user_position_ai)?;

    OrderFilled {
        user: *user.key,
        market: market_key,
        polymarket_market_id: market.polymarket_market_id.clone(),
        side: quote.side,
        outcome: quote.outcome,
        size: quote.size,
        price: quote.price,
        nonce: quote.nonce,
    }
    .emit()?;

    Ok(())
}
