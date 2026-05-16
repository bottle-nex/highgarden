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
    /** Tx signature if a fresh create_market landed, or "recovered" when
     *  the PDA was found already on-chain and we just adopted it. */
    signature: string;
    marketPda: string;
    polymarketMarketIdHashHex: string;
    /** True when the PDA already existed (previous create succeeded but
     *  the DB write didn't, so we recover without re-sending). */
    recovered: boolean;
}

export interface ResolveMarketInput {
    marketPda: string;
    winningOutcome: "YES" | "NO";
}

export interface ResolveMarketResult {
    /** Tx signature if a fresh resolve landed, or "recovered" when the
     *  market was already resolved on-chain and we just adopted the
     *  existing winner. */
    signature: string;
    marketPda: string;
    winningOutcome: "YES" | "NO";
    /** True when the on-chain market was already in `Resolved` state, so
     *  no tx was sent — controller should persist DB to match. */
    recovered: boolean;
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
        const admin = this.get_admin_keypair();
        const market_pda = new PublicKey(input.marketPda);

        // Recovery: if the on-chain market is already Resolved (because a
        // previous resolve tx landed but the DB write didn't, or because
        // the hedger's auto-resolver got here first), don't try to send
        // a second resolve — the program would reject with
        // `MarketClosed (6004 / 0x1774)`. Adopt the existing on-chain
        // winner and let the controller mirror it into the DB.
        const onchain = await this.try_fetch_market(client, market_pda);
        if (onchain?.status === "Resolved") {
            const winner = this.read_onchain_winner(onchain.winningOutcome);
            if (winner !== null && winner !== input.winningOutcome) {
                throw new Error(
                    `market is already resolved on-chain as ${winner}; cannot re-resolve as ${input.winningOutcome}`,
                );
            }
            return {
                signature: "recovered",
                marketPda: input.marketPda,
                winningOutcome: winner ?? input.winningOutcome,
                recovered: true,
            };
        }
        if (onchain?.status === "Cancelled") {
            throw new Error(`market is cancelled on-chain; cannot resolve`);
        }

        const winning_outcome = input.winningOutcome === "YES" ? 0 : 1;
        // Admin pays the tx fee so the oracle wallet doesn't have to
        // hold SOL. Oracle still signs the resolve_market ix (the on-chain
        // handler enforces `Config.oracle_signer == oracle.key`).
        const signature = await client.resolveMarket({
            oracleSigner: oracle.publicKey,
            market: market_pda,
            winningOutcome: winning_outcome,
            signer: oracle,
            feePayer: admin,
        });
        return {
            signature,
            marketPda: input.marketPda,
            winningOutcome: input.winningOutcome,
            recovered: false,
        };
    }

    /**
     * Reads on-chain Market state. Returns null when the PDA doesn't
     * exist or any decode/network error happens — the caller treats
     * that as "no recovery info, proceed with normal flow" so a
     * transient RPC blip doesn't block resolve.
     */
    private async try_fetch_market(
        client: SolmarketClient,
        market_pda: PublicKey,
    ): Promise<{ status: string; winningOutcome: number | null } | null> {
        try {
            const market = await client.fetchMarket(market_pda);
            return { status: market.status, winningOutcome: market.winningOutcome };
        } catch {
            return null;
        }
    }

    private read_onchain_winner(value: number | null): "YES" | "NO" | null {
        if (value === 0) return "YES";
        if (value === 1) return "NO";
        return null;
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
        const idHash = SolmarketClient.sha256(input.polymarketMarketId);
        const [marketPda] = client.deriveMarketPda(idHash);

        // Recovery path: if the PDA already exists and is owned by our
        // program, a previous create_market landed on-chain but the DB
        // write didn't. Adopt the existing PDA instead of trying to
        // create it again (system_program::create_account rejects with
        // "already in use" / custom error 0x0 in that case).
        const recovered = await this.try_recover_existing_market(client.connection, client.programId, marketPda);
        if (recovered) {
            return {
                signature: "recovered",
                marketPda: marketPda.toBase58(),
                polymarketMarketIdHashHex: Buffer.from(idHash).toString("hex"),
                recovered: true,
            };
        }

        const params = this.build_params(input, admin.publicKey);
        const result = await client.createMarket(params);
        return {
            signature: result.signature,
            marketPda: result.marketPda.toBase58(),
            polymarketMarketIdHashHex: Buffer.from(result.polymarketMarketIdHash).toString("hex"),
            recovered: false,
        };
    }

    /**
     * Returns true if `marketPda` already exists on-chain and is owned
     * by our program (so we can safely adopt it instead of re-creating).
     * Throws if the account exists but is owned by another program —
     * that's a real collision the operator needs to know about, not
     * something we can recover from.
     */
    private async try_recover_existing_market(
        connection: Connection,
        program_id: PublicKey,
        market_pda: PublicKey,
    ): Promise<boolean> {
        const info = await connection.getAccountInfo(market_pda, "confirmed");
        if (!info) return false;
        if (!info.owner.equals(program_id)) {
            throw new Error(
                `market PDA ${market_pda.toBase58()} exists but is owned by ${info.owner.toBase58()}, not by our program ${program_id.toBase58()}`,
            );
        }
        return true;
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
