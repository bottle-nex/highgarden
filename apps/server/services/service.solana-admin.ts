import { AnchorProvider, BN } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/esm/nodewallet.js";
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

export default class SolanaAdminService {
    private client: SolmarketClient | null = null;

    public is_configured(): boolean {
        return !!ENV.SERVER_SOLANA_ADMIN_KEYPAIR;
    }

    public async create_market(
        input: CreateOnChainMarketInput,
    ): Promise<CreateOnChainMarketResult> {
        const client = this.get_client();
        const params = this.build_params(input, client.provider.publicKey!);
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
        const keypair = this.load_admin_keypair(ENV.SERVER_SOLANA_ADMIN_KEYPAIR!);
        const wallet = new NodeWallet(keypair);
        const provider = new AnchorProvider(connection, wallet, {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
        });
        return new SolmarketClient(provider);
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
            endTime: new BN(Math.floor(input.endAt.getTime() / 1000)),
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
