use solana_program::program_error::ProgramError;
use thiserror::Error;

/// Mirror of the Anchor `#[error_code]` enum from the original contract.
/// Anchor assigns codes starting at 6000 and emits them as `ProgramError::Custom(code)`,
/// so we keep the same numbering to remain wire-compatible with existing clients.
#[derive(Error, Debug, Clone, Copy)]
#[repr(u32)]
pub enum SolMarketError {
    #[error("Quote has expired")]
    QuoteExpired = 6000,
    #[error("Quote signature is invalid")]
    InvalidSignature = 6001,
    #[error("Missing ed25519 verification instruction")]
    MissingSignature = 6002,
    #[error("Nonce already used")]
    NonceUsed = 6003,
    #[error("Market is not open")]
    MarketClosed = 6004,
    #[error("Market is paused")]
    MarketPaused = 6005,
    #[error("Market has ended")]
    MarketEnded = 6006,
    #[error("Market has not been resolved yet")]
    MarketNotResolved = 6007,
    #[error("Quote's market does not match account")]
    MarketMismatch = 6008,
    #[error("Invalid outcome value")]
    InvalidOutcome = 6009,
    #[error("Invalid side value")]
    InvalidSide = 6010,
    #[error("Invalid price value")]
    InvalidPrice = 6011,
    #[error("Invalid size value")]
    InvalidSize = 6012,
    #[error("Insufficient shares to sell")]
    InsufficientShares = 6013,
    #[error("No winning shares to claim")]
    NoWinningShares = 6014,
    #[error("Math overflow")]
    MathOverflow = 6015,
    #[error("Provided market id hash does not match")]
    InvalidMarketId = 6016,
    #[error("Unauthorized signer")]
    Unauthorized = 6017,
    #[error("Cannot close position with unclaimed winning shares")]
    WinningSharesUnclaimed = 6018,
}

impl From<SolMarketError> for ProgramError {
    fn from(e: SolMarketError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
