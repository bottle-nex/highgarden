import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Ed25519Program,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  type TransactionInstruction,
  type TransactionSignature,
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";

import type { Contract } from "./contract";
import { IDL } from "./idl";

export { IDL } from "./idl";
export type { Contract } from "./contract";
export * from "./types";

import {
  CONFIG_SEED,
  MARKET_SEED,
  NONCE_SEED,
  POSITION_SEED,
  TREASURY_AUTHORITY_SEED,
  TREASURY_VAULT_SEED,
} from "./types";
import type {
  AdminMarketParams,
  ClaimParams,
  ConfigAccount,
  CreateMarketParams,
  CreateMarketResult,
  InitializeConfigParams,
  MarketAccount,
  PlaceOrderParams,
  QuoteInput,
  ResolveMarketParams,
  SignedQuoteType,
  UserPositionAccount,
} from "./types";

export class SolmarketClient {
  readonly program: Program<Contract>;
  readonly programId: PublicKey;
  readonly provider: AnchorProvider;
  readonly configPda: PublicKey;
  readonly treasuryAuthorityPda: PublicKey;
  readonly treasuryVaultPda: PublicKey;

  constructor(provider: AnchorProvider) {
    this.provider = provider;
    this.program = new Program<Contract>(IDL as unknown as Contract, provider);
    this.programId = this.program.programId;
    [this.configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], this.programId);
    [this.treasuryAuthorityPda] = PublicKey.findProgramAddressSync(
      [TREASURY_AUTHORITY_SEED],
      this.programId,
    );
    [this.treasuryVaultPda] = PublicKey.findProgramAddressSync(
      [TREASURY_VAULT_SEED],
      this.programId,
    );
  }

  deriveMarketPda(polymarketMarketId: string | Buffer): [PublicKey, number] {
    const hash =
      typeof polymarketMarketId === "string"
        ? SolmarketClient.sha256(polymarketMarketId)
        : polymarketMarketId;
    return PublicKey.findProgramAddressSync([MARKET_SEED, hash], this.programId);
  }

  derivePositionPda(user: PublicKey, market: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [POSITION_SEED, user.toBuffer(), market.toBuffer()],
      this.programId,
    );
  }

  deriveNoncePda(nonce: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([NONCE_SEED, nonce], this.programId);
  }

  static sha256(input: Buffer | string): Buffer {
    const data = typeof input === "string" ? Buffer.from(input, "utf8") : input;
    return createHash("sha256").update(data).digest();
  }

  static generateNonce(): Buffer {
    return randomBytes(16);
  }

  /**
   * Borsh-serialize a SignedQuote to match the on-chain layout:
   *   market: [u8;32], side: u8, outcome: u8, price: u16 LE,
   *   size: u64 LE, expires_at: i64 LE, nonce: [u8;16]
   */
  static serializeSignedQuote(q: QuoteInput): Buffer {
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

  static buildQuoteSignatureIx(signer: Keypair, quote: QuoteInput): TransactionInstruction {
    return Ed25519Program.createInstructionWithPrivateKey({
      privateKey: signer.secretKey,
      message: SolmarketClient.serializeSignedQuote(quote),
    });
  }

  async fetchConfig(): Promise<ConfigAccount> {
    return this.program.account.config.fetch(this.configPda);
  }

  async fetchMarket(market: PublicKey): Promise<MarketAccount> {
    return this.program.account.market.fetch(market);
  }

  async fetchMarketByPolymarketId(polymarketMarketId: string): Promise<MarketAccount> {
    const [marketPda] = this.deriveMarketPda(polymarketMarketId);
    return this.fetchMarket(marketPda);
  }

  async fetchUserPosition(user: PublicKey, market: PublicKey): Promise<UserPositionAccount> {
    const [pda] = this.derivePositionPda(user, market);
    return this.program.account.userPosition.fetch(pda);
  }

  // ------------------- Instructions ------------------- //

  async initializeConfig(params: InitializeConfigParams): Promise<TransactionSignature> {
    return this.program.methods
      .initializeConfig(params.oracleSigner, params.quoteSigner)
      .accountsStrict({
        admin: params.admin,
        config: this.configPda,
        treasuryAuthority: this.treasuryAuthorityPda,
        treasuryVault: this.treasuryVaultPda,
        usdcMint: params.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
  }

  async createMarket(params: CreateMarketParams): Promise<CreateMarketResult> {
    const idHash = SolmarketClient.sha256(params.polymarketMarketId);
    const [marketPda] = this.deriveMarketPda(idHash);
    const endTime = BN.isBN(params.endTime) ? params.endTime : new BN(params.endTime);

    const signature = await this.program.methods
      .createMarket(
        Array.from(idHash) as number[],
        params.polymarketMarketId,
        Array.from(Buffer.from(params.questionHash)) as number[],
        endTime,
        params.tickSize,
        params.yesTokenId,
        params.noTokenId,
      )
      .accountsStrict({
        admin: params.admin,
        config: this.configPda,
        market: marketPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { signature, marketPda, polymarketMarketIdHash: idHash };
  }

  async placeOrder(params: PlaceOrderParams): Promise<TransactionSignature> {
    const [userPositionPda] = this.derivePositionPda(params.user, params.quote.market);
    const [usedNoncePda] = this.deriveNoncePda(params.quote.nonce);

    const quoteArg: SignedQuoteType = {
      market: params.quote.market,
      side: params.quote.side,
      outcome: params.quote.outcome,
      price: params.quote.price,
      size: params.quote.size,
      expiresAt: params.quote.expiresAt,
      nonce: Array.from(params.quote.nonce) as number[],
    };

    return this.program.methods
      .placeOrder(quoteArg)
      .accountsStrict({
        user: params.user,
        config: this.configPda,
        market: params.quote.market,
        userPosition: userPositionPda,
        usedNonce: usedNoncePda,
        userUsdc: params.userUsdc,
        treasuryVault: this.treasuryVaultPda,
        treasuryAuthority: this.treasuryAuthorityPda,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([params.ed25519Ix])
      .rpc();
  }

  async claim(params: ClaimParams): Promise<TransactionSignature> {
    const [userPositionPda] = this.derivePositionPda(params.user, params.market);
    return this.program.methods
      .claim()
      .accountsStrict({
        user: params.user,
        config: this.configPda,
        market: params.market,
        userPosition: userPositionPda,
        userUsdc: params.userUsdc,
        treasuryVault: this.treasuryVaultPda,
        treasuryAuthority: this.treasuryAuthorityPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  async resolveMarket(params: ResolveMarketParams): Promise<TransactionSignature> {
    return this.program.methods
      .resolveMarket(params.winningOutcome)
      .accountsStrict({
        config: this.configPda,
        oracleSigner: params.oracleSigner,
        market: params.market,
      })
      .rpc();
  }

  async adminPauseMarket(params: AdminMarketParams): Promise<TransactionSignature> {
    return this.program.methods
      .adminPauseMarket()
      .accountsStrict({
        config: this.configPda,
        admin: params.admin,
        market: params.market,
      })
      .rpc();
  }

  async adminUnpauseMarket(params: AdminMarketParams): Promise<TransactionSignature> {
    return this.program.methods
      .adminUnpauseMarket()
      .accountsStrict({
        config: this.configPda,
        admin: params.admin,
        market: params.market,
      })
      .rpc();
  }
}
