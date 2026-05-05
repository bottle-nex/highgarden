import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/esm/nodewallet.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { SolmarketClient } from "@solmarket/contract";
import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";

export interface SubmitInput {
    marketPda: string;
    winningOutcome: "YES" | "NO";
}

export interface SubmitResult {
    signature: string;
    submittedAt: Date;
}

export default class SolanaResolutionSubmitter {
    private client: SolmarketClient | null = null;
    private oracle_keypair: Keypair | null = null;

    private static log() {
        return LoggerFactory.for_category("resolver-submit");
    }

    public is_configured(): boolean {
        return !!ENV.HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR;
    }

    public async submit(input: SubmitInput): Promise<SubmitResult> {
        if (!this.is_configured()) {
            throw new Error("HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR is not set");
        }
        const client = this.get_client();
        const outcome_int = input.winningOutcome === "YES" ? 0 : 1;
        const signature = await client.resolveMarket({
            oracleSigner: this.get_oracle().publicKey,
            market: new PublicKey(input.marketPda),
            winningOutcome: outcome_int as 0 | 1,
        });
        return { signature, submittedAt: new Date() };
    }

    private get_client(): SolmarketClient {
        if (!this.client) this.client = this.build_client();
        return this.client;
    }

    private build_client(): SolmarketClient {
        const connection = new Connection(ENV.HEDGER_SOLANA_RPC_URL, "confirmed");
        const wallet = new NodeWallet(this.get_oracle()) as unknown as Wallet;
        const provider = new AnchorProvider(connection, wallet, {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
        });
        return new SolmarketClient(provider);
    }

    private get_oracle(): Keypair {
        if (!this.oracle_keypair) {
            this.oracle_keypair = this.load_oracle_keypair(
                ENV.HEDGER_SOLANA_ORACLE_SIGNER_KEYPAIR!,
            );
        }
        return this.oracle_keypair;
    }

    private load_oracle_keypair(encoded: string): Keypair {
        const trimmed = encoded.trim();
        if (trimmed.startsWith("[")) {
            const arr = JSON.parse(trimmed) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        const secret = bs58.decode(trimmed);
        return Keypair.fromSecretKey(secret);
    }
}
