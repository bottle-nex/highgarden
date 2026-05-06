import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Contract, providers } from "ethers";
import bs58 from "bs58";
import { ENV } from "../config/config.env";

// Polymarket migrated from USDC.e → native USDC → their own pUSD token.
// The CTF Exchange now settles in pUSD, so that's the trading collateral
// (verified via polygonscan tx history on a live funder).
const PUSD_ADDRESS_POLYGON = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
const ERC20_BALANCE_OF_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
] as const;
const TREASURY_VAULT_SEED = Buffer.from("treasury_vault");

// Severity thresholds for the UI to colour-code. Hardcoded for MVP — easy to
// move to env later once you've watched a few weeks of real-world drain.
const THRESHOLDS = {
    sol: { warn: 0.5, critical: 0.05 },
    usdcVault: { warn: 1000, critical: 100 },
    pol: { warn: 1, critical: 0.1 },
    pusd: { warn: 500, critical: 50 },
} as const;

export type Severity = "ok" | "warn" | "critical" | "unknown";

export interface SolanaBalances {
    configured: boolean;
    adminPubkey: string | null;
    adminSol: { amount: number; severity: Severity };
    treasuryVaultPda: string | null;
    treasuryUsdc: { amount: number; severity: Severity };
}

export interface PolygonBalances {
    configured: boolean;
    funderAddress: string | null;
    funderPol: { amount: number; severity: Severity };
    funderPusd: { amount: number; severity: Severity };
}

export interface BalanceSnapshot {
    fetchedAt: string;
    solana: SolanaBalances;
    polygon: PolygonBalances;
    thresholds: typeof THRESHOLDS;
}

export default class BalanceMonitorService {
    public async fetch_all(): Promise<BalanceSnapshot> {
        const [solana, polygon] = await Promise.all([
            this.fetch_solana_safely(),
            this.fetch_polygon_safely(),
        ]);
        return {
            fetchedAt: new Date().toISOString(),
            solana,
            polygon,
            thresholds: THRESHOLDS,
        };
    }

    private async fetch_solana_safely(): Promise<SolanaBalances> {
        try {
            return await this.fetch_solana();
        } catch {
            return this.empty_solana();
        }
    }

    private async fetch_solana(): Promise<SolanaBalances> {
        if (!ENV.SERVER_SOLANA_ADMIN_KEYPAIR) return this.empty_solana();

        const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        const admin = this.load_admin_pubkey();
        const treasury_vault_pda = this.derive_treasury_vault();

        const [admin_lamports, vault_token] = await Promise.all([
            connection.getBalance(admin),
            this.fetch_token_balance(connection, treasury_vault_pda),
        ]);

        const admin_sol_amount = admin_lamports / 1_000_000_000;
        return {
            configured: true,
            adminPubkey: admin.toBase58(),
            adminSol: {
                amount: admin_sol_amount,
                severity: this.classify(admin_sol_amount, THRESHOLDS.sol),
            },
            treasuryVaultPda: treasury_vault_pda.toBase58(),
            treasuryUsdc: {
                amount: vault_token,
                severity: this.classify(vault_token, THRESHOLDS.usdcVault),
            },
        };
    }

    private async fetch_token_balance(
        connection: Connection,
        token_account: PublicKey,
    ): Promise<number> {
        try {
            const result = await connection.getTokenAccountBalance(token_account, "confirmed");
            return Number(result.value.uiAmountString ?? "0");
        } catch {
            return 0;
        }
    }

    private async fetch_polygon_safely(): Promise<PolygonBalances> {
        try {
            return await this.fetch_polygon();
        } catch {
            return this.empty_polygon();
        }
    }

    private async fetch_polygon(): Promise<PolygonBalances> {
        if (!ENV.SERVER_POLYMARKET_FUNDER_ADDRESS) return this.empty_polygon();
        const provider = new providers.JsonRpcProvider(ENV.SERVER_POLYGON_RPC_URL);
        const funder = ENV.SERVER_POLYMARKET_FUNDER_ADDRESS;

        const pol_wei = await provider.getBalance(funder);
        const pol_amount = Number(pol_wei.toString()) / 1e18;
        const pusd_amount = await this.fetch_pusd(provider, funder);

        return {
            configured: true,
            funderAddress: funder,
            funderPol: {
                amount: pol_amount,
                severity: this.classify(pol_amount, THRESHOLDS.pol),
            },
            funderPusd: {
                amount: pusd_amount,
                severity: this.classify(pusd_amount, THRESHOLDS.pusd),
            },
        };
    }

    private async fetch_pusd(
        provider: providers.JsonRpcProvider,
        funder: string,
    ): Promise<number> {
        const pusd = new Contract(PUSD_ADDRESS_POLYGON, ERC20_BALANCE_OF_ABI, provider);
        const raw = await pusd.balanceOf(funder);
        // pUSD has 6 decimals (verified via polygonscan).
        return Number(raw.toString()) / 1e6;
    }

    private classify(amount: number, t: { warn: number; critical: number }): Severity {
        if (amount <= t.critical) return "critical";
        if (amount <= t.warn) return "warn";
        return "ok";
    }

    private load_admin_pubkey(): PublicKey {
        const encoded = ENV.SERVER_SOLANA_ADMIN_KEYPAIR!.trim();
        const secret = encoded.startsWith("[")
            ? Uint8Array.from(JSON.parse(encoded) as number[])
            : bs58.decode(encoded);
        return Keypair.fromSecretKey(secret).publicKey;
    }

    private derive_treasury_vault(): PublicKey {
        const program_id = new PublicKey(ENV.SERVER_SOLANA_PROGRAM_ID);
        const [pda] = PublicKey.findProgramAddressSync([TREASURY_VAULT_SEED], program_id);
        return pda;
    }

    private empty_solana(): SolanaBalances {
        return {
            configured: false,
            adminPubkey: null,
            adminSol: { amount: 0, severity: "unknown" },
            treasuryVaultPda: null,
            treasuryUsdc: { amount: 0, severity: "unknown" },
        };
    }

    private empty_polygon(): PolygonBalances {
        return {
            configured: false,
            funderAddress: null,
            funderPol: { amount: 0, severity: "unknown" },
            funderPusd: { amount: 0, severity: "unknown" },
        };
    }
}
