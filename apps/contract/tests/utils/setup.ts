import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createHash, randomBytes } from "crypto";
import BN from "bn.js";

import { Contract } from "../../target/types/contract";

export const CONFIG_SEED = Buffer.from("config");
export const MARKET_SEED = Buffer.from("market");
export const POSITION_SEED = Buffer.from("position");
export const NONCE_SEED = Buffer.from("nonce");
export const TREASURY_AUTHORITY_SEED = Buffer.from("treasury_authority");
export const TREASURY_VAULT_SEED = Buffer.from("treasury_vault");

export const TEST_POLYMARKET_ID =
  "0xabc1234567890def1234567890abcdef1234567890abcdef1234567890abcdef";
export const TEST_YES_TOKEN_ID = "1234567890123456789012345";
export const TEST_NO_TOKEN_ID = "9876543210987654321098765";
export const TEST_TICK_SIZE = 100;

export interface TestContext {
  provider: anchor.AnchorProvider;
  program: Program<Contract>;
  admin: Keypair;
  oracleSigner: Keypair;
  quoteSigner: Keypair;
  usdcMint: PublicKey;
  configPda: PublicKey;
  treasuryAuthorityPda: PublicKey;
  treasuryVaultPda: PublicKey;
  systemProgram: PublicKey;
  tokenProgram: PublicKey;
  rent: PublicKey;
}

export function sha256(input: Buffer | string): Buffer {
  const data = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return createHash("sha256").update(data).digest();
}

export function generateNonce(): Buffer {
  return randomBytes(16);
}

export function deriveMarketPda(
  programId: PublicKey,
  polymarketIdHash: Buffer,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MARKET_SEED, polymarketIdHash], programId);
}

export function derivePositionPda(
  programId: PublicKey,
  user: PublicKey,
  market: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [POSITION_SEED, user.toBuffer(), market.toBuffer()],
    programId,
  );
}

export function deriveNoncePda(programId: PublicKey, nonce: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([NONCE_SEED, nonce], programId);
}

export interface QuoteFields {
  market: PublicKey;
  side: number;
  outcome: number;
  price: number;
  size: BN;
  expiresAt: BN;
  nonce: Buffer;
}

/**
 * Borsh-serialize a SignedQuote to match the on-chain layout:
 *   market: [u8;32], side: u8, outcome: u8, price: u16 LE,
 *   size: u64 LE, expires_at: i64 LE, nonce: [u8;16]
 */
export function serializeSignedQuote(q: QuoteFields): Buffer {
  const buf = Buffer.alloc(68);
  let offset = 0;
  q.market.toBuffer().copy(buf, offset);
  offset += 32;
  buf.writeUInt8(q.side, offset);
  offset += 1;
  buf.writeUInt8(q.outcome, offset);
  offset += 1;
  buf.writeUInt16LE(q.price, offset);
  offset += 2;
  q.size.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;
  q.expiresAt.toArrayLike(Buffer, "le", 8).copy(buf, offset);
  offset += 8;
  q.nonce.copy(buf, offset);
  return buf;
}

export function getTestMarketPda(programId: PublicKey): [PublicKey, number] {
  return deriveMarketPda(programId, sha256(TEST_POLYMARKET_ID));
}

export async function createTestContext(): Promise<TestContext> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.contract as Program<Contract>;

  const admin = (provider.wallet as anchor.Wallet).payer;
  const oracleSigner = Keypair.generate();
  const quoteSigner = Keypair.generate();

  const usdcMint = await createMint(provider.connection, admin, admin.publicKey, null, 6);

  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
  const [treasuryAuthorityPda] = PublicKey.findProgramAddressSync(
    [TREASURY_AUTHORITY_SEED],
    program.programId,
  );
  const [treasuryVaultPda] = PublicKey.findProgramAddressSync(
    [TREASURY_VAULT_SEED],
    program.programId,
  );

  return {
    provider,
    program,
    admin,
    oracleSigner,
    quoteSigner,
    usdcMint,
    configPda,
    treasuryAuthorityPda,
    treasuryVaultPda,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    rent: SYSVAR_RENT_PUBKEY,
  };
}
