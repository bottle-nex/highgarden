use anchor_lang::prelude::*;

declare_id!("6phzgYZv5a2k7iNKcoSjS9SaP8dzybtkVHjhcfHxWSL7");

#[program]
pub mod contract {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
