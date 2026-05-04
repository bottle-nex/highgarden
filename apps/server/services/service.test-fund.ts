import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createMintToInstruction,
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import { prisma } from "@solmarket/database";
import { ENV } from "../config/config.env";

export interface FundUserInput {
    userId: string;
    solLamports?: number;
    usdcAmount?: number;
}

export interface FundUserResult {
    userPubkey: string;
    solTxSignature: string | null;
    usdcTxSignature: string | null;
}

export default class TestFundService {
    public is_configured(): boolean {
        return !!ENV.SERVER_SOLANA_ADMIN_KEYPAIR;
    }

    public async fund(input: FundUserInput): Promise<FundUserResult> {
        const target_pubkey = await this.lookup_user_pubkey(input.userId);
        const admin = this.load_admin_keypair();
        const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");

        const sol_sig = await this.maybe_send_sol(
            connection,
            admin,
            target_pubkey,
            input.solLamports,
        );
        const usdc_sig = await this.maybe_mint_usdc(
            connection,
            admin,
            target_pubkey,
            input.usdcAmount,
        );

        return {
            userPubkey: target_pubkey.toBase58(),
            solTxSignature: sol_sig,
            usdcTxSignature: usdc_sig,
        };
    }

    private async lookup_user_pubkey(user_id: string): Promise<PublicKey> {
        const row = await prisma.user.findUnique({
            where: { id: user_id },
            select: { custodialPublicKey: true },
        });
        if (!row?.custodialPublicKey) {
            throw new Error(
                `user ${user_id} has no custodial wallet — call /users/me/wallet first`,
            );
        }
        return new PublicKey(row.custodialPublicKey);
    }

    private load_admin_keypair(): Keypair {
        const raw = ENV.SERVER_SOLANA_ADMIN_KEYPAIR;
        if (!raw) throw new Error("SERVER_SOLANA_ADMIN_KEYPAIR is not set");
        const trimmed = raw.trim();
        if (trimmed.startsWith("[")) {
            return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed) as number[]));
        }
        return Keypair.fromSecretKey(bs58.decode(trimmed));
    }

    private async maybe_send_sol(
        connection: Connection,
        admin: Keypair,
        target: PublicKey,
        lamports: number | undefined,
    ): Promise<string | null> {
        if (!lamports || lamports <= 0) return null;
        const tx = new Transaction().add(
            SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: target, lamports }),
        );
        return sendAndConfirmTransaction(connection, tx, [admin], { commitment: "confirmed" });
    }

    private async maybe_mint_usdc(
        connection: Connection,
        admin: Keypair,
        target: PublicKey,
        amount: number | undefined,
    ): Promise<string | null> {
        if (!amount || amount <= 0) return null;
        const mint = new PublicKey(ENV.SERVER_USDC_MINT);
        const ata = getAssociatedTokenAddressSync(mint, target);
        const raw_amount = BigInt(Math.floor(amount * 1_000_000));

        const tx = new Transaction().add(
            createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, target, mint),
            createMintToInstruction(mint, ata, admin.publicKey, raw_amount, [], TOKEN_PROGRAM_ID),
        );
        return sendAndConfirmTransaction(connection, tx, [admin], { commitment: "confirmed" });
    }
}
