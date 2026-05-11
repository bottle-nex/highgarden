import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { SolmarketClient } from "@solmarket/contract";
import { ENV } from "../config/config.env";

export interface CreateOnChainMarketInput {
    polymarketMarketId: string;
    question: string;
    endAt: Date;
    tickSize: string;
    yesTokenId: string;
    noTokenId: string;
}

export interface CreateOnChainMarketResult {
    signature: string;
    marketPda: string;
    polymarketMarketIdHashHex: string;
}

export interface ResolveMarketInput {
    marketPda: string;
    winningOutcome: "YES" | "NO";
}

export interface ResolveMarketResult {
    signature: string;
    marketPda: string;
    winningOutcome: "YES" | "NO";
}

export default class SolanaAdminService {
    private client: SolmarketClient | null = null;
    private admin_keypair: Keypair | null = null;
    private oracle_keypair: Keypair | null = null;

    public is_configured(): boolean {
        return !!ENV.SERVER_SOLANA_ADMIN_KEYPAIR;
    }

    public is_resolve_configured(): boolean {
        return !!ENV.SERVER_SOLANA_ORACLE_KEYPAIR;
    }

    /**
     * Admin-triggered manual resolution. Signs `resolve_market` with the
     * server's oracle keypair (must equal `Config.oracle_signer` on-chain
     * or the program rejects with `Unauthorized`). Used by the
     * `POST /admin/resolve-market/:marketId` endpoint to mimic the
     * hedger's automatic UMA-based resolver flow during testing.
     *
     * No DB writes here — the controller updates `Market.status` /
     * `ResolverState` after the on-chain tx confirms.
     */
    public async resolve_market(input: ResolveMarketInput): Promise<ResolveMarketResult> {
        const client = this.get_client();
        const oracle = this.get_oracle_keypair();
        const winning_outcome = input.winningOutcome === "YES" ? 0 : 1;
        const signature = await client.resolveMarket({
            oracleSigner: oracle.publicKey,
            market: new PublicKey(input.marketPda),
            winningOutcome: winning_outcome,
            signer: oracle,
        });
        return {
            signature,
            marketPda: input.marketPda,
            winningOutcome: input.winningOutcome,
        };
    }

    private get_oracle_keypair(): Keypair {
        if (!ENV.SERVER_SOLANA_ORACLE_KEYPAIR) {
            throw new Error(
                "SERVER_SOLANA_ORACLE_KEYPAIR is not set; cannot sign resolve_market",
            );
        }
        if (!this.oracle_keypair) {
            this.oracle_keypair = this.load_admin_keypair(ENV.SERVER_SOLANA_ORACLE_KEYPAIR);
        }
        return this.oracle_keypair;
    }

    public async create_market(
        input: CreateOnChainMarketInput,
    ): Promise<CreateOnChainMarketResult> {
        const client = this.get_client();
        const admin = this.get_admin_keypair();
        const params = this.build_params(input, admin.publicKey);
        const result = await client.createMarket(params);
        return {
            signature: result.signature,
            marketPda: result.marketPda.toBase58(),
            polymarketMarketIdHashHex: Buffer.from(result.polymarketMarketIdHash).toString("hex"),
        };
    }

    private get_client(): SolmarketClient {
        if (!ENV.SERVER_SOLANA_ADMIN_KEYPAIR) {
            throw new Error(
                "SERVER_SOLANA_ADMIN_KEYPAIR is not set; cannot send admin transactions",
            );
        }
        if (!this.client) this.client = this.build_client();
        return this.client;
    }

    private build_client(): SolmarketClient {
        const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        return new SolmarketClient({
            connection,
            programId: new PublicKey(ENV.SERVER_SOLANA_PROGRAM_ID),
            defaultSigner: this.get_admin_keypair(),
        });
    }

    private get_admin_keypair(): Keypair {
        if (!this.admin_keypair) {
            this.admin_keypair = this.load_admin_keypair(ENV.SERVER_SOLANA_ADMIN_KEYPAIR!);
        }
        return this.admin_keypair;
    }

    private load_admin_keypair(encoded: string): Keypair {
        const trimmed = encoded.trim();
        if (trimmed.startsWith("[")) {
            const arr = JSON.parse(trimmed) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        const secret = bs58.decode(trimmed);
        return Keypair.fromSecretKey(secret);
    }

    private build_params(input: CreateOnChainMarketInput, admin: PublicKey) {
        return {
            admin,
            polymarketMarketId: input.polymarketMarketId,
            questionHash: SolmarketClient.sha256(input.question),
            endTime: BigInt(Math.floor(input.endAt.getTime() / 1000)),
            tickSize: this.tick_size_to_cents(input.tickSize),
            yesTokenId: input.yesTokenId,
            noTokenId: input.noTokenId,
        };
    }

    private tick_size_to_cents(raw: string): number {
        const parsed = Number.parseFloat(raw);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error(`invalid tickSize "${raw}"`);
        }
        const cents = Math.round(parsed * 100);
        if (cents < 1) return 1;
        return cents;
    }
}
