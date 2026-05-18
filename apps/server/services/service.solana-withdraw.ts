import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
    getAccount,
    getAssociatedTokenAddressSync,
    TokenAccountNotFoundError,
    TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
import bs58 from "bs58";
import { prisma } from "@solmarket/database";
import { ENV } from "../config/config.env";
import { decrypt_secret_key } from "./service.crypto";

export interface WithdrawInput {
    userId: string;
    /** Recipient wallet public key (base58). Tokens are sent to this owner's
     *  associated USDC token account, creating that ATA on the fly when
     *  it doesn't exist (admin keypair pays the ~0.002 SOL rent). */
    destination: string;
    /** Human-readable USDC amount (e.g. 12.34). Converted internally to the
     *  6-decimal raw unit for the SPL transfer. */
    uiAmount: number;
}

export interface WithdrawResult {
    txSignature: string;
    destination: string;
    uiAmount: number;
    createdRecipientAta: boolean;
}

export type WithdrawErrorCode =
    | "USER_NO_WALLET"
    | "INVALID_DESTINATION"
    | "INSUFFICIENT_BALANCE"
    | "AMOUNT_TOO_SMALL"
    | "AMOUNT_INVALID"
    | "SELF_TRANSFER"
    | "NO_USDC_ACCOUNT"
    | "RPC_FAILED";

export class WithdrawError extends Error {
    public readonly code: WithdrawErrorCode;
    constructor(code: WithdrawErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = "WithdrawError";
    }
}

const USDC_DECIMALS = 6;
const USDC_MULTIPLIER = 10n ** BigInt(USDC_DECIMALS);
const MIN_WITHDRAW_USDC = 1;

export default class SolanaWithdrawService {
    public async withdraw_usdc(input: WithdrawInput): Promise<WithdrawResult> {
        if (!Number.isFinite(input.uiAmount) || input.uiAmount <= 0) {
            throw new WithdrawError("AMOUNT_INVALID", "withdraw amount must be a positive number");
        }
        if (input.uiAmount < MIN_WITHDRAW_USDC) {
            throw new WithdrawError(
                "AMOUNT_TOO_SMALL",
                `minimum withdrawal is ${MIN_WITHDRAW_USDC} USDC`,
            );
        }

        let destination_pk: PublicKey;
        try {
            destination_pk = new PublicKey(input.destination);
        } catch {
            throw new WithdrawError(
                "INVALID_DESTINATION",
                "destination is not a valid Solana address",
            );
        }

        const user_keypair = await this.load_custodial_keypair(input.userId);
        const fee_payer = this.load_fee_payer_keypair();

        if (user_keypair.publicKey.equals(destination_pk)) {
            throw new WithdrawError(
                "SELF_TRANSFER",
                "destination matches your own custodial address",
            );
        }

        const usdc_mint = new PublicKey(ENV.SERVER_USDC_MINT);
        const source_ata = getAssociatedTokenAddressSync(usdc_mint, user_keypair.publicKey);
        const dest_ata = getAssociatedTokenAddressSync(usdc_mint, destination_pk);
        const connection = new Connection(ENV.SERVER_SOLANA_RPC_URL, "confirmed");

        // Pull the on-chain USDC balance for the gating check. Doing the
        // gate here gives the client a clean error before we burn a tx;
        // the SPL transfer would also fail on-chain if balance shifts
        // between this read and submission, in which case we surface
        // RPC_FAILED below.
        let source_balance: bigint;
        try {
            const source_account = await getAccount(connection, source_ata);
            source_balance = source_account.amount;
        } catch (e) {
            if (
                e instanceof TokenAccountNotFoundError ||
                e instanceof TokenInvalidAccountOwnerError
            ) {
                throw new WithdrawError("NO_USDC_ACCOUNT", "you have no USDC balance to withdraw");
            }
            throw new WithdrawError("RPC_FAILED", "couldn't read your USDC balance from chain");
        }

        const transfer_raw = BigInt(Math.round(input.uiAmount * Number(USDC_MULTIPLIER)));
        if (transfer_raw > source_balance) {
            throw new WithdrawError("INSUFFICIENT_BALANCE", "amount exceeds your USDC balance");
        }

        // Destination's USDC ATA may not exist yet (most common case for
        // first-time recipients on a fresh address). We prepend the ATA
        // creation instruction with the admin keypair as payer — the rent
        // (~0.002 SOL) is absorbed by the platform, not the user.
        const dest_info = await connection.getAccountInfo(dest_ata);
        const needs_create = dest_info === null;

        const tx = new Transaction();
        if (needs_create) {
            tx.add(
                createAssociatedTokenAccountInstruction(
                    fee_payer.publicKey,
                    dest_ata,
                    destination_pk,
                    usdc_mint,
                ),
            );
        }
        tx.add(
            createTransferInstruction(
                source_ata,
                dest_ata,
                user_keypair.publicKey,
                transfer_raw,
            ),
        );

        const blockhash = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash.blockhash;
        tx.feePayer = fee_payer.publicKey;
        tx.sign(fee_payer, user_keypair);

        let signature: string;
        try {
            signature = await connection.sendRawTransaction(tx.serialize(), {
                skipPreflight: false,
                preflightCommitment: "confirmed",
            });
            const confirm = await connection.confirmTransaction(
                {
                    signature,
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight,
                },
                "confirmed",
            );
            if (confirm.value.err) {
                console.error("[withdraw] confirmation error", confirm.value.err);
                throw new WithdrawError("RPC_FAILED", "withdrawal couldn't be confirmed on chain");
            }
        } catch (e) {
            if (e instanceof WithdrawError) throw e;
            console.error("[withdraw] rpc error", e);
            throw new WithdrawError(
                "RPC_FAILED",
                e instanceof Error ? e.message : "withdrawal failed",
            );
        }

        return {
            txSignature: signature,
            destination: input.destination,
            uiAmount: input.uiAmount,
            createdRecipientAta: needs_create,
        };
    }

    private load_fee_payer_keypair(): Keypair {
        const encoded = ENV.SERVER_SOLANA_ADMIN_KEYPAIR;
        if (!encoded) {
            throw new Error(
                "SERVER_SOLANA_ADMIN_KEYPAIR not set — fee_payer is required for withdraw",
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
            throw new WithdrawError("USER_NO_WALLET", "user has no custodial wallet");
        }
        const seed = decrypt_secret_key(row.custodialSecretEncrypted);
        const keypair = Keypair.fromSeed(seed);
        if (keypair.publicKey.toBase58() !== row.custodialPublicKey) {
            throw new WithdrawError(
                "USER_NO_WALLET",
                "custodial keypair mismatch — derived pubkey does not match stored pubkey",
            );
        }
        return keypair;
    }
}
