use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;
use state::SignedQuote;

declare_id!("2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P");

#[program]
pub mod contract {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        oracle_signer: Pubkey,
        quote_signer: Pubkey,
    ) -> Result<()> {
        instructions::initialize_config::handler(ctx, oracle_signer, quote_signer)
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        polymarket_market_id_hash: [u8; 32],
        polymarket_market_id: String,
        question_hash: [u8; 32],
        end_time: i64,
        tick_size: u16,
        yes_token_id: String,
        no_token_id: String,
    ) -> Result<()> {
        instructions::create_market::handler(
            ctx,
            polymarket_market_id_hash,
            polymarket_market_id,
            question_hash,
            end_time,
            tick_size,
            yes_token_id,
            no_token_id,
        )
    }

    pub fn place_order(ctx: Context<PlaceOrder>, quote: SignedQuote) -> Result<()> {
        instructions::place_order::handler(ctx, quote)
    }

    pub fn resolve_market(ctx: Context<ResolveMarket>, winning_outcome: u8) -> Result<()> {
        instructions::resolve_market::handler(ctx, winning_outcome)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }

    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        instructions::close_position::handler(ctx)
    }

    pub fn admin_pause_market(ctx: Context<AdminPauseMarket>) -> Result<()> {
        instructions::admin::pause_handler(ctx)
    }

    pub fn admin_unpause_market(ctx: Context<AdminPauseMarket>) -> Result<()> {
        instructions::admin::unpause_handler(ctx)
    }
}
