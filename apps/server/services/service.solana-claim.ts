import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import { prisma } from "@solmarket/database";
import { SolmarketClient } from "@solmarket/contract";
import { ENV } from "../config/config.env";
import { decrypt_secret_key } from "./service.crypto";

export interface ClaimInput {
    userId: string;
    marketDbId: string;
}

export interface ClaimResult {
    txSignature: string;
    marketPda: string;
    userPubkey: string;
    /** Signature of the follow-up close_position tx, or null if it failed. */
    closePositionSignature: string | null;
}

export type ClaimErrorCode =
    | "USER_NO_WALLET"
    | "MARKET_NOT_FOUND"
    | "MARKET_NOT_LISTED_ON_SOLANA"
    | "MARKET_NOT_RESOLVED";

export class ClaimError extends Error {
    public readonly code: ClaimErrorCode;
    constructor(code: ClaimErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = "ClaimError";
    }
}

export default class SolanaClaimService {
    public async claim(input: ClaimInput): Promise<ClaimResult> {
        const user_keypair = await this.load_custodial_keypair(input.userId);
        const fee_payer = this.load_fee_payer_keypair();
        const market = await this.load_resolved_market(input.marketDbId);
        const market_pda = new PublicKey(market.solanaMarketPda);

        const client = this.build_client(fee_payer);
        const user_usdc = getAssociatedTokenAddressSync(
            new PublicKey(ENV.SERVER_USDC_MINT),
            user_keypair.publicKey,
        );

        const sig = await client.claim({
            user: user_keypair.publicKey,
            userKeypair: user_keypair,
            feePayer: fee_payer,
            market: market_pda,
            userUsdc: user_usdc,
        });

        // Best-effort cleanup: reclaim the position PDA's rent. The winning
        // shares were just zeroed by claim above, so close_position's
        // require!(winning_balance == 0) check passes. Failures here are
        // non-fatal — the user got their USDC, the position just stays
        // open until a future sweeper picks it up.
        const closeSig = await this.try_close_position(client, {
            user: user_keypair,
            feePayer: fee_payer,
            market: market_pda,
        });

        return {
            txSignature: sig,
            marketPda: market.solanaMarketPda,
            userPubkey: user_keypair.publicKey.toBase58(),
            closePositionSignature: closeSig,
        };
    }

    private async try_close_position(
        client: SolmarketClient,
        args: { user: Keypair; feePayer: Keypair; market: PublicKey },
    ): Promise<string | null> {
        try {
            return await client.closePosition({
                user: args.user.publicKey,
                userKeypair: args.user,
                feePayer: args.feePayer,
                market: args.market,
            });
        } catch (err) {
            console.warn("[claim] close_position failed (non-fatal)", err);
            return null;
        }
    }

    private load_fee_payer_keypair(): Keypair {
        const encoded = ENV.SERVER_SOLANA_ADMIN_KEYPAIR;
        if (!encoded) {
            throw new Error(
                "SERVER_SOLANA_ADMIN_KEYPAIR not set — fee_payer is required for claim",
            );
        }
        const trimmed = encoded.trim();
        if (trimmed.startsWith("[")) {
            const arr = JSON.parse(trimmed) as number[];
            return Keypair.fromSecretKey(Uint8Array.from(arr));
        }
        return Keypair.fromSecretKey(bs58.decode(trimmed));
    }

    private async load_custodial_keypair(user_id: string): Promise<Keypair> {
        const row = await prisma.user.findUnique({
            where: { id: user_id },
            select: { custodialPublicKey: true, custodialSecretEncrypted: true },
        });
        if (!row?.custodialSecretEncrypted || !row.custodialPublicKey) {
            throw new ClaimError("USER_NO_WALLET", "user has no custodial wallet");
        }
        const seed = decrypt_secret_key(row.custodialSecretEncrypted);
        const keypair = Keypair.fromSeed(seed);
        if (keypair.publicKey.toBase58() !== row.custodialPublicKey) {
            throw new ClaimError(
                "USER_NO_WALLET",
                "custodial keypair mismatch — derived pubkey does not match stored pubkey",
            );
        }
        return keypair;
    }

    private async load_resolved_market(market_db_id: string): Promise<{ solanaMarketPda: string }> {
        const row = await prisma.market.findUnique({
            where: { id: market_db_id },
            select: { solanaMarketPda: true, status: true },
        });
        if (!row) throw new ClaimError("MARKET_NOT_FOUND", "market not found");
        if (!row.solanaMarketPda) {
            throw new ClaimError("MARKET_NOT_LISTED_ON_SOLANA", "market has no on-chain PDA");
        }
        // We don't strictly enforce row.status === RESOLVED here — the on-chain
        // contract will reject with MarketNotResolved if it isn't, and that
        // error bubbles up cleanly to the client.
        return { solanaMarketPda: row.solanaMarketPda };
    }

    private build_client(_user_keypair: Keypair): SolmarketClient {
        const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");
        return new SolmarketClient({
            connection,
            programId: new PublicKey(ENV.SERVER_SOLANA_PROGRAM_ID),
        });
    }
}
