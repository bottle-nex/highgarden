import { BN } from "@coral-xyz/anchor";
import type { IdlAccounts, IdlTypes } from "@coral-xyz/anchor";
import type { Contract } from "./contract";
import { PublicKey, Keypair } from "@solana/web3.js";
import type { TransactionInstruction, TransactionSignature } from "@solana/web3.js";

export { IDL } from "./idl";
export type { Contract } from "./contract";

export const CONFIG_SEED = Buffer.from("config");
export const MARKET_SEED = Buffer.from("market");
export const POSITION_SEED = Buffer.from("position");
export const NONCE_SEED = Buffer.from("nonce");
export const TREASURY_AUTHORITY_SEED = Buffer.from("treasury_authority");
export const TREASURY_VAULT_SEED = Buffer.from("treasury_vault");

export type ConfigAccount = IdlAccounts<Contract>["config"];
export type MarketAccount = IdlAccounts<Contract>["market"];
export type UserPositionAccount = IdlAccounts<Contract>["userPosition"];
export type UsedNonceAccount = IdlAccounts<Contract>["usedNonce"];
export type SignedQuoteType = IdlTypes<Contract>["signedQuote"];

export type OrderSide = 0 | 1;
export type Outcome = 0 | 1;

export interface QuoteInput {
  market: PublicKey;
  side: OrderSide;
  outcome: Outcome;
  price: number;
  size: BN;
  expiresAt: BN;
  nonce: Buffer;
}

export interface InitializeConfigParams {
  admin: PublicKey;
  oracleSigner: PublicKey;
  quoteSigner: PublicKey;
  usdcMint: PublicKey;
}

export interface CreateMarketParams {
  admin: PublicKey;
  polymarketMarketId: string;
  questionHash: Buffer | Uint8Array;
  endTime: BN | number;
  tickSize: number;
  yesTokenId: string;
  noTokenId: string;
}

export interface PlaceOrderParams {
  user: PublicKey;
  quote: QuoteInput;
  userUsdc: PublicKey;
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
}

export interface AdminMarketParams {
  admin: PublicKey;
  market: PublicKey;
}

export interface CreateMarketResult {
  signature: TransactionSignature;
  marketPda: PublicKey;
  polymarketMarketIdHash: Buffer;
}
