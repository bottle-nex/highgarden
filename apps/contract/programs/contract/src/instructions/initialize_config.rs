use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{CONFIG_SEED, TREASURY_AUTHORITY_SEED, TREASURY_VAULT_SEED};
use crate::state::Config;

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: PDA that owns the treasury vault token account.
    #[account(
        seeds = [TREASURY_AUTHORITY_SEED],
        bump,
    )]
    pub treasury_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [TREASURY_VAULT_SEED],
        bump,
        token::mint = usdc_mint,
        token::authority = treasury_authority,
    )]
    pub treasury_vault: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeConfig>,
    oracle_signer: Pubkey,
    quote_signer: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.oracle_signer = oracle_signer;
    config.quote_signer = quote_signer;
    config.treasury_vault = ctx.accounts.treasury_vault.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.treasury_authority_bump = ctx.bumps.treasury_authority;
    config.treasury_vault_bump = ctx.bumps.treasury_vault;
    config.bump = ctx.bumps.config;
    Ok(())
}
