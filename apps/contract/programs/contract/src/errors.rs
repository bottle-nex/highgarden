use anchor_lang::prelude::*;

#[error_code]
pub enum SolMarketError {
    #[msg("Quote has expired")]
    QuoteExpired,
    #[msg("Quote signature is invalid")]
    InvalidSignature,
    #[msg("Missing ed25519 verification instruction")]
    MissingSignature,
    #[msg("Nonce already used")]
    NonceUsed,
    #[msg("Market is not open")]
    MarketClosed,
    #[msg("Market is paused")]
    MarketPaused,
    #[msg("Market has ended")]
    MarketEnded,
    #[msg("Market has not been resolved yet")]
    MarketNotResolved,
    #[msg("Quote's market does not match account")]
    MarketMismatch,
    #[msg("Invalid outcome value")]
    InvalidOutcome,
    #[msg("Invalid side value")]
    InvalidSide,
    #[msg("Invalid price value")]
    InvalidPrice,
    #[msg("Invalid size value")]
    InvalidSize,
    #[msg("Insufficient shares to sell")]
    InsufficientShares,
    #[msg("No winning shares to claim")]
    NoWinningShares,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Provided market id hash does not match")]
    InvalidMarketId,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Cannot close position with unclaimed winning shares")]
    WinningSharesUnclaimed,
}
