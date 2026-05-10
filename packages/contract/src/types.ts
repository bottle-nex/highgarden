import type { Keypair, PublicKey, TransactionInstruction, TransactionSignature } from "@solana/web3.js";

/**
 * Public-facing types for the SolMarket native-Rust SDK.
 *
 * Conventions:
 *   - All u64 / i64 fields are typed as `bigint` (was `BN` under the
 *     Anchor SDK). Callers convert from numbers via `BigInt(...)`.
 *   - `Buffer` is preferred over `Uint8Array` for byte slices because
 *     the rest of the codebase deals in node Buffers.
 *   - Enum-like primitive values (side, outcome) use a numeric union.
 */

export type OrderSide = 0 | 1;
export type Outcome = 0 | 1;

export interface QuoteInput {
    market: PublicKey;
    side: OrderSide;
    outcome: Outcome;
    /** Price in cents, 1..=99. */
    price: number;
    /** Size in whole shares (u64). */
    size: bigint;
    /** Unix epoch seconds, signed (i64) so we can interop with on-chain Clock. */
    expiresAt: bigint;
    /** 16 random bytes — uniquely identifies the quote. */
    nonce: Buffer;
}

export interface InitializeConfigParams {
    admin: PublicKey;
    oracleSigner: PublicKey;
    quoteSigner: PublicKey;
    usdcMint: PublicKey;
    /** Optional override; defaults to the SDK's `defaultSigner`. Must equal `admin`. */
    signer?: Keypair;
}

export interface CreateMarketParams {
    admin: PublicKey;
    polymarketMarketId: string;
    questionHash: Buffer;
    /** Unix epoch seconds. */
    endTime: bigint;
    /** Tick size in cents (1..). */
    tickSize: number;
    yesTokenId: string;
    noTokenId: string;
    /** Optional override; defaults to the SDK's `defaultSigner`. Must equal `admin`. */
    signer?: Keypair;
}

export interface CreateMarketResult {
    signature: TransactionSignature;
    marketPda: PublicKey;
    polymarketMarketIdHash: Buffer;
}

export interface PlaceOrderParams {
    user: PublicKey;
    quote: QuoteInput;
    userUsdc: PublicKey;
    /** Pre-built ed25519 verification instruction; the program reads the
     *  preceding instruction in the tx to validate the quote signature. */
    ed25519Ix: TransactionInstruction;
    /** Pays tx fees and rent for newly-init'd PDAs (user_position, used_nonce). */
    feePayer: Keypair;
    /** Required so the program can co-sign for the USDC transfer. */
    userKeypair: Keypair;
}

export interface ClaimParams {
    user: PublicKey;
    market: PublicKey;
    userUsdc: PublicKey;
    /** Pays the tx fee. Lets the user keep zero SOL in their custodial wallet. */
    feePayer: Keypair;
    userKeypair: Keypair;
}

export interface ClosePositionParams {
    user: PublicKey;
    market: PublicKey;
    /** Pays the tx fee AND receives the reclaimed PDA rent. */
    feePayer: Keypair;
    userKeypair: Keypair;
}

export interface CloseUsedNonceParams {
    /** The 16-byte nonce of the quote whose UsedNonce PDA we're closing. */
    nonce: Buffer;
    /** Admin keypair — signs and receives the reclaimed rent. */
    admin: Keypair;
}

export interface ResolveMarketParams {
    oracleSigner: PublicKey;
    market: PublicKey;
    winningOutcome: Outcome;
    /** Optional override; defaults to the SDK's `defaultSigner`. Must equal `oracleSigner`. */
    signer?: Keypair;
}

export interface AdminMarketParams {
    admin: PublicKey;
    market: PublicKey;
    /** Optional override; defaults to the SDK's `defaultSigner`. Must equal `admin`. */
    signer?: Keypair;
}

/**
 * Decoded `OrderFilled` Anchor-style event emitted by `place_order`.
 * Used by the hedger ingester to dedupe + dispatch hedge jobs.
 */
export interface OrderFilledEvent {
    user: PublicKey;
    market: PublicKey;
    polymarketMarketId: string;
    side: number;
    outcome: number;
    size: bigint;
    price: number;
    nonce: Buffer;
}

/** Decoded `MarketResolved` event — currently unused by callers but parseable. */
export interface MarketResolvedEvent {
    market: PublicKey;
    winningOutcome: number;
}

/** Decoded `Claimed` event — currently unused by callers but parseable. */
export interface ClaimedEvent {
    user: PublicKey;
    market: PublicKey;
    outcome: number;
    shares: bigint;
    payout: bigint;
}

/** Decoded `PositionClosed` event — currently unused by callers but parseable. */
export interface PositionClosedEvent {
    user: PublicKey;
    market: PublicKey;
    rentRecipient: PublicKey;
}

/** On-chain `Config` account state. */
export interface ConfigAccount {
    admin: PublicKey;
    oracleSigner: PublicKey;
    quoteSigner: PublicKey;
    treasuryVault: PublicKey;
    usdcMint: PublicKey;
    treasuryAuthorityBump: number;
    treasuryVaultBump: number;
    bump: number;
}

export type MarketStatus = "Open" | "Resolved" | "Cancelled";

/** On-chain `Market` account state. */
export interface MarketAccount {
    polymarketMarketId: string;
    polymarketMarketIdHash: Buffer;
    questionHash: Buffer;
    endTime: bigint;
    tickSize: number;
    yesTokenId: string;
    noTokenId: string;
    status: MarketStatus;
    winningOutcome: number | null;
    totalYes: bigint;
    totalNo: bigint;
    paused: boolean;
    bump: number;
}

/** On-chain `UserPosition` account state. */
export interface UserPositionAccount {
    user: PublicKey;
    market: PublicKey;
    yesShares: bigint;
    noShares: bigint;
    bump: number;
}

/** On-chain `UsedNonce` account state. */
export interface UsedNonceAccount {
    nonce: Buffer;
    bump: number;
}
