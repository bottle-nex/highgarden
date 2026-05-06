import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/esm/nodewallet.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { SolmarketClient } from "@solmarket/contract";
import { ENV } from "../config/env";

export default class HedgerAdminTxSubmitter {
    private client: SolmarketClient | null = null;
    private admin_keypair: Keypair | null = null;

    public is_configured(): boolean {
        return !!ENV.HEDGER_SOLANA_ADMIN_KEYPAIR;
    }

    public async pause_market(market_pda: string): Promise<string> {
        if (!this.is_configured()) {
            throw new Error("HEDGER_SOLANA_ADMIN_KEYPAIR is not set");
        }
        const client = this.get_client();
        return client.adminPauseMarket({
            admin: this.get_admin().publicKey,
            market: new PublicKey(market_pda),
        });
    }

    private get_client(): SolmarketClient {
        if (!this.client) this.client = this.build_client();
        return this.client;
    }

    private build_client(): SolmarketClient {
        const connection = new Connection(ENV.HEDGER_SOLANA_RPC_URL, "confirmed");
        const wallet = new NodeWallet(this.get_admin()) as unknown as Wallet;
        const provider = new AnchorProvider(connection, wallet, {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
        });
        return new SolmarketClient(provider);
    }

    private get_admin(): Keypair {
        if (!this.admin_keypair) {
            this.admin_keypair = this.load_keypair(ENV.HEDGER_SOLANA_ADMIN_KEYPAIR!);
        }
        return this.admin_keypair;
    }

    private load_keypair(encoded: string): Keypair {
        const trimmed = encoded.trim();
        if (trimmed.startsWith("[")) {
            const arr = JSON.parse(trimmed) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        return Keypair.fromSecretKey(bs58.decode(trimmed));
    }
}
