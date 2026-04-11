import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createHash } from "crypto";

import { Contract } from "../../target/types/contract";

export const CONFIG_SEED = Buffer.from("config");
export const MARKET_SEED = Buffer.from("market");
export const TREASURY_AUTHORITY_SEED = Buffer.from("treasury_authority");
export const TREASURY_VAULT_SEED = Buffer.from("treasury_vault");

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

export function deriveMarketPda(
  programId: PublicKey,
  polymarketIdHash: Buffer,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MARKET_SEED, polymarketIdHash], programId);
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
