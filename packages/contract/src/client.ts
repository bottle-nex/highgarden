import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  type Commitment,
  type TransactionSignature,
} from "@solana/web3.js";
import { createHash, randomBytes } from "node:crypto";

import {
  CONFIG_SEED,
  MARKET_SEED,
  NONCE_SEED,
  POSITION_SEED,
  TREASURY_AUTHORITY_SEED,
  TREASURY_VAULT_SEED,
} from "./constants";
import {
  decode_config_account,
  decode_market_account,
  decode_used_nonce_account,
  decode_user_position_account,
} from "./decode";
import { ix_disc } from "./discriminator";
import {
  encode_close_used_nonce_args,
  encode_create_market_args,
  encode_empty_args,
  encode_initialize_config_args,
  encode_place_order_args,
  encode_resolve_market_args,
  serialize_signed_quote,
} from "./serialize";
import type {
  AdminMarketParams,
  ClaimParams,
  ClosePositionParams,
  CloseUsedNonceParams,
  ConfigAccount,
  CreateMarketParams,
  CreateMarketResult,
  InitializeConfigParams,
  MarketAccount,
  PlaceOrderParams,
  QuoteInput,
  ResolveMarketParams,
  UsedNonceAccount,
  UserPositionAccount,
} from "./types";

export interface SolmarketClientOptions {
  /** Live RPC connection. Reused for `getAccountInfo`, send/confirm, etc. */
  connection: Connection;
  /** Deployed program ID — pulled from `*_SOLANA_PROGRAM_ID` envs by callers. */
  programId: PublicKey;
  /**
   * Optional default keypair used to sign + pay for instructions that don't
   * accept an explicit signer in their params (createMarket, resolveMarket,
   * adminPauseMarket, adminUnpauseMarket, initializeConfig). Per-call
   * `signer` overrides take precedence.
   */
  defaultSigner?: Keypair;
  /** Commitment used for sendRawTransaction + getLatestBlockhash. Default `"confirmed"`. */
  commitment?: Commitment;
}

/**
 * Drop-in replacement for the old Anchor-based `SolmarketClient`.
 *
 * Public surface mirrors v1 closely so existing callers (server's
 * solana-trade / solana-claim / solana-admin / quote-signer / nonce-sweeper,
 * hedger's resolver / hedger / ingest-decoder) keep working with minimal
 * changes — the only required changes are the constructor shape (no more
 * AnchorProvider) and switching `BN` → `bigint` in `QuoteInput`.
 *
 * Implementation pattern: each instruction method builds a
 * `TransactionInstruction` manually (8-byte discriminator + borsh args +
 * positional account list, in the exact order the Rust handler expects),
 * wraps it in a Transaction, signs with the appropriate keypair(s), and
 * sends + confirms.
 */
export class SolmarketClient {
  public readonly connection: Connection;
  public readonly programId: PublicKey;
  public readonly configPda: PublicKey;
  public readonly treasuryAuthorityPda: PublicKey;
  public readonly treasuryVaultPda: PublicKey;
  private readonly defaultSigner?: Keypair;
  private readonly commitment: Commitment;

  constructor(opts: SolmarketClientOptions) {
    this.connection = opts.connection;
    this.programId = opts.programId;
    this.defaultSigner = opts.defaultSigner;
    this.commitment = opts.commitment ?? "confirmed";
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

  // ──────────────── PDA derivation ────────────────

  public deriveMarketPda(polymarket_market_id: string | Buffer): [PublicKey, number] {
    const hash =
      typeof polymarket_market_id === "string"
        ? SolmarketClient.sha256(polymarket_market_id)
        : polymarket_market_id;
    return PublicKey.findProgramAddressSync([MARKET_SEED, hash], this.programId);
  }

  public derivePositionPda(user: PublicKey, market: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [POSITION_SEED, user.toBuffer(), market.toBuffer()],
      this.programId,
    );
  }

  public deriveNoncePda(nonce: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([NONCE_SEED, nonce], this.programId);
  }

  // ──────────────── Static helpers ────────────────

  /**
   * Convenience hash matching `solana_program::hash::hash` used on-chain
   * (sha256 over the input bytes). Used for the polymarket_market_id_hash
   * passed to `create_market`.
   */
  public static sha256(input: Buffer | string): Buffer {
    const data = typeof input === "string" ? Buffer.from(input, "utf8") : input;
    return createHash("sha256").update(data).digest();
  }

  public static generateNonce(): Buffer {
    return randomBytes(16);
  }

  /** Borsh-encodes a SignedQuote — used by the off-chain quote signer
   *  to produce the message ed25519-signed and embedded as the preceding
   *  ix in the place_order tx. */
  public static serializeSignedQuote(q: QuoteInput): Buffer {
    return serialize_signed_quote(q);
  }

  /** Convenience that wraps the ed25519 native program with a private key. */
  public static buildQuoteSignatureIx(signer: Keypair, quote: QuoteInput): TransactionInstruction {
    return Ed25519Program.createInstructionWithPrivateKey({
      privateKey: signer.secretKey,
      message: serialize_signed_quote(quote),
    });
  }

  // ──────────────── Account reads ────────────────

  public async fetchConfig(): Promise<ConfigAccount> {
    const data = await this.fetch_account_data(this.configPda, "Config");
    return decode_config_account(data);
  }

  public async fetchMarket(market: PublicKey): Promise<MarketAccount> {
    const data = await this.fetch_account_data(market, "Market");
    return decode_market_account(data);
  }

  public async fetchMarketByPolymarketId(polymarket_market_id: string): Promise<MarketAccount> {
    const [pda] = this.deriveMarketPda(polymarket_market_id);
    return this.fetchMarket(pda);
  }

  public async fetchUserPosition(user: PublicKey, market: PublicKey): Promise<UserPositionAccount> {
    const [pda] = this.derivePositionPda(user, market);
    const data = await this.fetch_account_data(pda, "UserPosition");
    return decode_user_position_account(data);
  }

  public async fetchUsedNonce(nonce: Buffer): Promise<UsedNonceAccount> {
    const [pda] = this.deriveNoncePda(nonce);
    const data = await this.fetch_account_data(pda, "UsedNonce");
    return decode_used_nonce_account(data);
  }

  private async fetch_account_data(pubkey: PublicKey, label: string): Promise<Buffer> {
    const info = await this.connection.getAccountInfo(pubkey, this.commitment);
    if (!info) throw new Error(`${label} account not found at ${pubkey.toBase58()}`);
    return Buffer.from(info.data);
  }

  // ──────────────── Instructions ────────────────

  public async initializeConfig(params: InitializeConfigParams): Promise<TransactionSignature> {
    const signer = this.resolve_signer(params.signer, params.admin, "initializeConfig.admin");
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: params.admin, isSigner: true, isWritable: true },
        { pubkey: this.configPda, isSigner: false, isWritable: true },
        { pubkey: this.treasuryAuthorityPda, isSigner: false, isWritable: false },
        { pubkey: this.treasuryVaultPda, isSigner: false, isWritable: true },
        { pubkey: params.usdcMint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        ix_disc("initialize_config"),
        encode_initialize_config_args(params.oracleSigner, params.quoteSigner),
      ]),
    });
    return this.send_with_signers(new Transaction().add(ix), [signer]);
  }

  public async createMarket(params: CreateMarketParams): Promise<CreateMarketResult> {
    const signer = this.resolve_signer(params.signer, params.admin, "createMarket.admin");
    const id_hash = SolmarketClient.sha256(params.polymarketMarketId);
    const [market_pda] = this.deriveMarketPda(id_hash);
    const args = encode_create_market_args({
      polymarket_market_id_hash: id_hash,
      polymarket_market_id: params.polymarketMarketId,
      question_hash: params.questionHash,
      end_time: params.endTime,
      tick_size: params.tickSize,
      yes_token_id: params.yesTokenId,
      no_token_id: params.noTokenId,
    });
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: params.admin, isSigner: true, isWritable: true },
        { pubkey: this.configPda, isSigner: false, isWritable: false },
        { pubkey: market_pda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([ix_disc("create_market"), args]),
    });
    const signature = await this.send_with_signers(new Transaction().add(ix), [signer]);
    return { signature, marketPda: market_pda, polymarketMarketIdHash: id_hash };
  }

  public async placeOrder(params: PlaceOrderParams): Promise<TransactionSignature> {
    const [user_position_pda] = this.derivePositionPda(params.user, params.quote.market);
    const [used_nonce_pda] = this.deriveNoncePda(params.quote.nonce);
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: params.user, isSigner: true, isWritable: true },
        { pubkey: params.feePayer.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.configPda, isSigner: false, isWritable: false },
        { pubkey: params.quote.market, isSigner: false, isWritable: true },
        { pubkey: user_position_pda, isSigner: false, isWritable: true },
        { pubkey: used_nonce_pda, isSigner: false, isWritable: true },
        { pubkey: params.userUsdc, isSigner: false, isWritable: true },
        { pubkey: this.treasuryVaultPda, isSigner: false, isWritable: true },
        { pubkey: this.treasuryAuthorityPda, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([ix_disc("place_order"), encode_place_order_args(params.quote)]),
    });
    const tx = new Transaction().add(params.ed25519Ix, ix);
    return this.send_with_fee_payer(tx, params.feePayer, [params.feePayer, params.userKeypair]);
  }

  public async claim(params: ClaimParams): Promise<TransactionSignature> {
    const [user_position_pda] = this.derivePositionPda(params.user, params.market);
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: params.user, isSigner: true, isWritable: true },
        { pubkey: this.configPda, isSigner: false, isWritable: false },
        { pubkey: params.market, isSigner: false, isWritable: false },
        { pubkey: user_position_pda, isSigner: false, isWritable: true },
        { pubkey: params.userUsdc, isSigner: false, isWritable: true },
        { pubkey: this.treasuryVaultPda, isSigner: false, isWritable: true },
        { pubkey: this.treasuryAuthorityPda, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([ix_disc("claim"), encode_empty_args()]),
    });
    const tx = new Transaction().add(ix);
    return this.send_with_fee_payer(tx, params.feePayer, [params.feePayer, params.userKeypair]);
  }

  public async closePosition(params: ClosePositionParams): Promise<TransactionSignature> {
    const [user_position_pda] = this.derivePositionPda(params.user, params.market);
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: params.user, isSigner: true, isWritable: false },
        { pubkey: params.feePayer.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.configPda, isSigner: false, isWritable: false },
        { pubkey: params.market, isSigner: false, isWritable: false },
        { pubkey: user_position_pda, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([ix_disc("close_position"), encode_empty_args()]),
    });
    const tx = new Transaction().add(ix);
    return this.send_with_fee_payer(tx, params.feePayer, [params.feePayer, params.userKeypair]);
  }

  public async closeUsedNonce(params: CloseUsedNonceParams): Promise<TransactionSignature> {
    const [used_nonce_pda] = this.deriveNoncePda(params.nonce);
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: params.admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.configPda, isSigner: false, isWritable: false },
        { pubkey: used_nonce_pda, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([
        ix_disc("close_used_nonce"),
        encode_close_used_nonce_args(params.nonce),
      ]),
    });
    return this.send_with_signers(new Transaction().add(ix), [params.admin]);
  }

  public async resolveMarket(params: ResolveMarketParams): Promise<TransactionSignature> {
    const signer = this.resolve_signer(
      params.signer,
      params.oracleSigner,
      "resolveMarket.oracleSigner",
    );
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.configPda, isSigner: false, isWritable: false },
        { pubkey: params.oracleSigner, isSigner: true, isWritable: false },
        { pubkey: params.market, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([
        ix_disc("resolve_market"),
        encode_resolve_market_args(params.winningOutcome),
      ]),
    });
    // When a separate `feePayer` is supplied, both keypairs sign but the
    // tx fee comes off `feePayer` — so the oracle wallet doesn't have to
    // hold SOL. Mirrors the place_order pattern. When absent, the oracle
    // pays its own fee (legacy single-signer behaviour).
    if (params.feePayer) {
      return this.send_with_fee_payer(
        new Transaction().add(ix),
        params.feePayer,
        [params.feePayer, signer],
      );
    }
    return this.send_with_signers(new Transaction().add(ix), [signer]);
  }

  public async adminPauseMarket(params: AdminMarketParams): Promise<TransactionSignature> {
    return this.admin_set_paused(params, "admin_pause_market");
  }

  public async adminUnpauseMarket(params: AdminMarketParams): Promise<TransactionSignature> {
    return this.admin_set_paused(params, "admin_unpause_market");
  }

  private async admin_set_paused(
    params: AdminMarketParams,
    ix_name: "admin_pause_market" | "admin_unpause_market",
  ): Promise<TransactionSignature> {
    const signer = this.resolve_signer(params.signer, params.admin, `${ix_name}.admin`);
    const ix = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: this.configPda, isSigner: false, isWritable: false },
        { pubkey: params.admin, isSigner: true, isWritable: false },
        { pubkey: params.market, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([ix_disc(ix_name), encode_empty_args()]),
    });
    return this.send_with_signers(new Transaction().add(ix), [signer]);
  }

  // ──────────────── Send/confirm helpers ────────────────

  /**
   * Resolves the signer for instructions whose only signer is the
   * `admin`/`oracleSigner` pubkey. Falls back to `defaultSigner` from
   * the constructor; throws if neither is set or the keypair's pubkey
   * doesn't match the param. The pubkey check is what catches stale
   * envs early instead of bouncing off the chain.
   */
  private resolve_signer(
    explicit: Keypair | undefined,
    expected: PublicKey,
    label: string,
  ): Keypair {
    const candidate = explicit ?? this.defaultSigner;
    if (!candidate) {
      throw new Error(
        `${label} requires a signer — pass params.signer or set defaultSigner on the SDK`,
      );
    }
    if (!candidate.publicKey.equals(expected)) {
      throw new Error(
        `${label} pubkey mismatch — signer=${candidate.publicKey.toBase58()} expected=${expected.toBase58()}`,
      );
    }
    return candidate;
  }

  /** Sends a single-signer tx using the signer as both fee payer and the instruction signer. */
  private async send_with_signers(
    tx: Transaction,
    signers: Keypair[],
  ): Promise<TransactionSignature> {
    if (signers.length === 0) throw new Error("send_with_signers requires at least one signer");
    const fee_payer = signers[0];
    if (!fee_payer) throw new Error("send_with_signers requires at least one signer");
    return this.send_with_fee_payer(tx, fee_payer, signers);
  }

  /**
   * Standard send-and-confirm: pulls a fresh blockhash, sets fee_payer,
   * signs with the given keypairs (deduplicated by pubkey), serializes,
   * and confirms. Returns the tx signature on success, otherwise lets
   * the underlying RPC error bubble up to the caller.
   */
  private async send_with_fee_payer(
    tx: Transaction,
    fee_payer: Keypair,
    signers: Keypair[],
  ): Promise<TransactionSignature> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      this.commitment,
    );
    tx.recentBlockhash = blockhash;
    tx.feePayer = fee_payer.publicKey;
    const dedup = dedupe_signers(signers);
    tx.sign(...dedup);
    const sig = await this.connection.sendRawTransaction(tx.serialize(), {
      preflightCommitment: this.commitment,
    });
    await this.connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      this.commitment,
    );
    return sig;
  }
}

/** dedupe by pubkey — Transaction.sign rejects duplicate signers. */
function dedupe_signers(signers: Keypair[]): Keypair[] {
  const seen = new Set<string>();
  const out: Keypair[] = [];
  for (const s of signers) {
    const k = s.publicKey.toBase58();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
