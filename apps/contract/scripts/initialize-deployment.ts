import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";
import { SolmarketClient } from "@solmarket/contract";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface Paths {
    deployer: string;
    admin: string;
    oracle: string;
    quote: string;
}

class DeploymentInitializer {
    private readonly rpc = new Connection("https://api.devnet.solana.com", "confirmed");

    public async run(paths: Paths): Promise<void> {
        const deployer = this.load(paths.deployer);
        const admin = this.load(paths.admin);
        const oracle = this.load(paths.oracle);
        const quote = this.load(paths.quote);

        await this.fund_admin(deployer, admin);
        const usdcMint = await this.create_usdc_mint(admin);
        await this.initialize_config(admin, oracle.publicKey, quote.publicKey, usdcMint);
        this.print_env_snippets({ admin: admin.publicKey, oracle: oracle.publicKey, quote: quote.publicKey, usdcMint });
    }

    private load(path: string): Keypair {
        const raw = readFileSync(path, "utf8");
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    }

    private async fund_admin(deployer: Keypair, admin: Keypair): Promise<void> {
        const balance = await this.rpc.getBalance(admin.publicKey);
        const target = 0.05 * LAMPORTS_PER_SOL;
        if (balance >= target) {
            console.log(`[fund] admin already has ${balance / LAMPORTS_PER_SOL} SOL`);
            return;
        }
        const top_up = target - balance;
        console.log(`[fund] transferring ${top_up / LAMPORTS_PER_SOL} SOL from deployer → admin`);
        const tx = new Transaction().add(
            SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: admin.publicKey, lamports: top_up }),
        );
        const sig = await this.rpc.sendTransaction(tx, [deployer]);
        await this.rpc.confirmTransaction(sig, "confirmed");
        console.log(`[fund] tx ${sig}`);
    }

    private async create_usdc_mint(admin: Keypair): Promise<PublicKey> {
        console.log(`[mint] creating devnet USDC test mint (6 decimals)…`);
        const mint = await createMint(this.rpc, admin, admin.publicKey, null, 6);
        console.log(`[mint] usdcMint = ${mint.toBase58()}`);
        return mint;
    }

    private async initialize_config(
        admin: Keypair,
        oracle_signer: PublicKey,
        quote_signer: PublicKey,
        usdc_mint: PublicKey,
    ): Promise<void> {
        const wallet = new Wallet(admin);
        const provider = new AnchorProvider(this.rpc, wallet, { commitment: "confirmed" });
        const client = new SolmarketClient(provider);

        const [treasuryAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from("treasury_authority")],
            client.programId,
        );
        const [treasuryVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("treasury_vault")],
            client.programId,
        );

        console.log(`[init] sending initialize_config…`);
        const sig = await client.program.methods
            .initializeConfig(oracle_signer, quote_signer)
            .accountsStrict({
                admin: admin.publicKey,
                config: client.configPda,
                treasuryAuthority,
                treasuryVault,
                usdcMint: usdc_mint,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .signers([admin])
            .rpc();
        console.log(`[init] tx ${sig}`);
    }

    private print_env_snippets(args: {
        admin: PublicKey;
        oracle: PublicKey;
        quote: PublicKey;
        usdcMint: PublicKey;
    }): void {
        console.log("");
        console.log("════════════════════════════════════════════════════════════");
        console.log(" DEPLOYMENT INITIALIZED — paste into your .env files");
        console.log("════════════════════════════════════════════════════════════");
        console.log("");
        console.log("# ── apps/server/.env ───────────────────────────────────────");
        console.log("SERVER_SOLANA_PROGRAM_ID=2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P");
        console.log("SERVER_SOLANA_RPC_URL=https://api.devnet.solana.com");
        console.log(`SERVER_USDC_MINT=${args.usdcMint.toBase58()}`);
        console.log("# Paste the JSON array contents of ~/.config/solana/solmarket-admin.json:");
        console.log("# SERVER_SOLANA_ADMIN_KEYPAIR=[12,34,...]");
        console.log("");
        console.log("# ── apps/hedger/.env ───────────────────────────────────────");
        console.log("HEDGER_SOLANA_PROGRAM_ID=2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P");
        console.log("# (admin & oracle keypairs only needed for Phase 6/8 — skip for now)");
        console.log("");
        console.log("Public keys (already on-chain — safe to share):");
        console.log(`  admin         = ${args.admin.toBase58()}`);
        console.log(`  oracle_signer = ${args.oracle.toBase58()}`);
        console.log(`  quote_signer  = ${args.quote.toBase58()}`);
        console.log(`  usdc_mint     = ${args.usdcMint.toBase58()}`);
        console.log("");
        console.log("Keypair files (BACK THESE UP TO A PASSWORD MANAGER NOW):");
        console.log("  admin   ~/.config/solana/solmarket-admin.json");
        console.log("  oracle  ~/.config/solana/solmarket-oracle.json");
        console.log("  quote   ~/.config/solana/solmarket-quote.json");
        console.log("════════════════════════════════════════════════════════════");
    }
}

const home = homedir();
const initializer = new DeploymentInitializer();
await initializer.run({
    deployer: join(home, ".config/solana/id.json"),
    admin: join(home, ".config/solana/solmarket-admin.json"),
    oracle: join(home, ".config/solana/solmarket-oracle.json"),
    quote: join(home, ".config/solana/solmarket-quote.json"),
});
