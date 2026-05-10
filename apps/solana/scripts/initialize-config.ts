/**
 * One-shot first-deploy initializer for the native-Rust solmarket
 * program in apps/solana. After `solana program deploy` lands, run this
 * once to create the Config PDA + treasury vault PDA. Idempotent at the
 * on-chain level — a second run hits an "account already in use" error
 * because Config is `init`-only.
 *
 * Reuses the existing admin / oracle / quote keypairs so secrets don't
 * rotate when the program changes. The wallet that signs becomes
 * `Config.admin` permanently — there is no admin-rotation instruction.
 *
 * USAGE:
 *   bun apps/solana/scripts/initialize-config.ts
 *
 * REQUIRED ENVS (or paste below):
 *   HIGHGARDEN_PROGRAM_ID      — pubkey of the deployed program
 *   HIGHGARDEN_ADMIN_KEYPAIR   — path to admin keypair (default: ~/.config/solana/solmarket-admin.json)
 *   HIGHGARDEN_ORACLE_KEYPAIR  — path to oracle keypair (default: ~/.config/solana/solmarket-oracle.json)
 *   HIGHGARDEN_QUOTE_KEYPAIR   — path to quote keypair (default: ~/.config/solana/solmarket-quote.json)
 *   HIGHGARDEN_USDC_MINT       — existing SPL mint pubkey to reuse, OR omit to create a new one
 *   HIGHGARDEN_RPC_URL         — default https://api.devnet.solana.com
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import bs58 from "bs58";

interface Config {
  rpc_url: string;
  program_id: PublicKey;
  admin_keypair: Keypair;
  oracle_pubkey: PublicKey;
  quote_pubkey: PublicKey;
  usdc_mint: PublicKey | null; // null = create a new test mint
}

class HighgardenInitializer {
  public async run(): Promise<void> {
    const cfg = this.read_config();
    const conn = new Connection(cfg.rpc_url, "confirmed");

    const admin = cfg.admin_keypair;
    await this.ensure_admin_funded(conn, admin.publicKey);

    const usdc_mint = cfg.usdc_mint ?? (await this.create_test_mint(conn, admin));
    const pdas = this.derive_pdas(cfg.program_id);

    const ix = this.build_initialize_config_ix({
      program_id: cfg.program_id,
      admin: admin.publicKey,
      config_pda: pdas.config,
      treasury_authority_pda: pdas.treasury_authority,
      treasury_vault_pda: pdas.treasury_vault,
      usdc_mint,
      oracle_pubkey: cfg.oracle_pubkey,
      quote_pubkey: cfg.quote_pubkey,
    });

    const tx = new Transaction().add(ix);
    const sig = await conn.sendTransaction(tx, [admin], { preflightCommitment: "confirmed" });
    await conn.confirmTransaction(sig, "confirmed");

    this.print_summary({
      program_id: cfg.program_id,
      admin: admin.publicKey,
      oracle: cfg.oracle_pubkey,
      quote: cfg.quote_pubkey,
      usdc_mint,
      pdas,
      tx_sig: sig,
    });
  }

  private read_config(): Config {
    const program_id_str = process.env.HIGHGARDEN_PROGRAM_ID;
    if (!program_id_str) {
      console.error("[init] HIGHGARDEN_PROGRAM_ID is required");
      process.exit(1);
    }
    const home = homedir();
    const admin_path =
      process.env.HIGHGARDEN_ADMIN_KEYPAIR ?? resolve(home, ".config/solana/solmarket-admin.json");
    const oracle_path =
      process.env.HIGHGARDEN_ORACLE_KEYPAIR ??
      resolve(home, ".config/solana/solmarket-oracle.json");
    const quote_path =
      process.env.HIGHGARDEN_QUOTE_KEYPAIR ?? resolve(home, ".config/solana/solmarket-quote.json");

    const admin_keypair = this.load_keypair(admin_path);
    const oracle_pubkey = this.load_keypair(oracle_path).publicKey;
    const quote_pubkey = this.load_keypair(quote_path).publicKey;

    const mint_str = process.env.HIGHGARDEN_USDC_MINT?.trim();
    const usdc_mint = mint_str ? new PublicKey(mint_str) : null;

    return {
      rpc_url: process.env.HIGHGARDEN_RPC_URL ?? "https://api.devnet.solana.com",
      program_id: new PublicKey(program_id_str),
      admin_keypair,
      oracle_pubkey,
      quote_pubkey,
      usdc_mint,
    };
  }

  private load_keypair(path: string): Keypair {
    const raw = readFileSync(path, "utf8").trim();
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(raw));
  }

  private async ensure_admin_funded(conn: Connection, admin: PublicKey): Promise<void> {
    const balance = await conn.getBalance(admin);
    const min_lamports = 50_000_000; // 0.05 SOL — covers Config + vault rent + tx fee
    if (balance >= min_lamports) {
      console.log(`[init] admin has ${balance / 1e9} SOL (ok)`);
      return;
    }
    console.warn(
      `[init] admin balance is ${balance / 1e9} SOL — needs ≥ 0.05 SOL. ` +
        `Top up with: solana transfer <admin-pubkey> 0.1 --url <rpc> --keypair ~/.config/solana/id.json`,
    );
    process.exit(1);
  }

  private async create_test_mint(conn: Connection, admin: Keypair): Promise<PublicKey> {
    console.log("[init] HIGHGARDEN_USDC_MINT not set — creating a fresh devnet test mint…");
    const mint = await createMint(conn, admin, admin.publicKey, null, 6);
    console.log(`[init] created mint ${mint.toBase58()} (decimals=6, mint authority=admin)`);
    return mint;
  }

  private derive_pdas(program_id: PublicKey) {
    const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program_id);
    const [treasury_authority] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury_authority")],
      program_id,
    );
    const [treasury_vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury_vault")],
      program_id,
    );
    return { config, treasury_authority, treasury_vault };
  }

  /** Anchor-style discriminator: sha256("global:initialize_config")[..8]. */
  private ix_discriminator(name: string): Buffer {
    const full = createHash("sha256").update(`global:${name}`).digest();
    return full.subarray(0, 8);
  }

  private build_initialize_config_ix(args: {
    program_id: PublicKey;
    admin: PublicKey;
    config_pda: PublicKey;
    treasury_authority_pda: PublicKey;
    treasury_vault_pda: PublicKey;
    usdc_mint: PublicKey;
    oracle_pubkey: PublicKey;
    quote_pubkey: PublicKey;
  }): TransactionInstruction {
    // Borsh layout for Args { oracle_signer: Pubkey, quote_signer: Pubkey }
    // = 32 + 32 raw bytes, no length prefix (fixed-size).
    const data = Buffer.concat([
      this.ix_discriminator("initialize_config"),
      args.oracle_pubkey.toBuffer(),
      args.quote_pubkey.toBuffer(),
    ]);

    // Account list — order matches the Rust handler in
    // apps/solana/programs/contract/src/instructions/initialize_config.rs.
    const keys = [
      { pubkey: args.admin, isSigner: true, isWritable: true },
      { pubkey: args.config_pda, isSigner: false, isWritable: true },
      { pubkey: args.treasury_authority_pda, isSigner: false, isWritable: false },
      { pubkey: args.treasury_vault_pda, isSigner: false, isWritable: true },
      { pubkey: args.usdc_mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      programId: args.program_id,
      keys,
      data,
    });
  }

  private print_summary(args: {
    program_id: PublicKey;
    admin: PublicKey;
    oracle: PublicKey;
    quote: PublicKey;
    usdc_mint: PublicKey;
    pdas: { config: PublicKey; treasury_authority: PublicKey; treasury_vault: PublicKey };
    tx_sig: string;
  }): void {
    const lines = [
      "",
      "════════════════════════════════════════════════════════════",
      "  initialize_config submitted — paste the new program id and",
      "  USDC mint into your .env files",
      "════════════════════════════════════════════════════════════",
      "",
      `  HIGHGARDEN_PROGRAM_ID            = ${args.program_id.toBase58()}`,
      `  USDC mint                        = ${args.usdc_mint.toBase58()}`,
      `  Config PDA                       = ${args.pdas.config.toBase58()}`,
      `  Treasury authority PDA           = ${args.pdas.treasury_authority.toBase58()}`,
      `  Treasury vault PDA               = ${args.pdas.treasury_vault.toBase58()}`,
      `  Admin pubkey  (Config.admin)     = ${args.admin.toBase58()}`,
      `  Oracle pubkey (Config.oracle)    = ${args.oracle.toBase58()}`,
      `  Quote pubkey  (Config.quote)     = ${args.quote.toBase58()}`,
      "",
      `  tx: https://explorer.solana.com/tx/${args.tx_sig}?cluster=devnet`,
      "",
      "  next: update .env files —",
      `    apps/server/.env  → SERVER_SOLANA_PROGRAM_ID=${args.program_id.toBase58()}`,
      `    apps/server/.env  → SERVER_USDC_MINT=${args.usdc_mint.toBase58()}`,
      `    apps/hedger/.env  → HEDGER_SOLANA_PROGRAM_ID=${args.program_id.toBase58()}`,
      "",
      "════════════════════════════════════════════════════════════",
    ];
    console.log(lines.join("\n"));
  }
}

await new HighgardenInitializer().run();
process.exit(0);
