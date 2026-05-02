import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { USDC_DECIMALS, USDC_MINT_ADDRESS } from './network';

export interface BuildUsdcTransferInput {
    connection: Connection;
    sender: PublicKey;
    recipient: PublicKey;
    /** Whole USDC units (e.g. 12.5 means 12.5 USDC). */
    ui_amount: number;
}

export interface BuildUsdcTransferResult {
    transaction: VersionedTransaction;
    /** True when the recipient ATA had to be created in this tx (sender pays rent). */
    creates_recipient_ata: boolean;
    recipient_ata: PublicKey;
    raw_amount: bigint;
}

const USDC_MINT = new PublicKey(USDC_MINT_ADDRESS);
const USDC_UNIT = 10 ** USDC_DECIMALS;

function to_raw_amount(ui_amount: number): bigint {
    if (!Number.isFinite(ui_amount) || ui_amount <= 0) {
        throw new Error('amount must be a positive number');
    }
    const raw = Math.round(ui_amount * USDC_UNIT);
    if (raw <= 0) {
        throw new Error('amount is below the minimum unit');
    }
    return BigInt(raw);
}

/**
 * Builds a versioned transaction that transfers USDC from `sender` to `recipient`.
 * If the recipient's associated token account does not yet exist, an idempotent
 * create instruction is prepended (sender pays the ~0.002 SOL rent).
 *
 * Returns the unsigned transaction; the caller is responsible for signing and sending.
 */
export async function build_usdc_transfer({
    connection,
    sender,
    recipient,
    ui_amount,
}: BuildUsdcTransferInput): Promise<BuildUsdcTransferResult> {
    const raw_amount = to_raw_amount(ui_amount);

    const sender_ata = getAssociatedTokenAddressSync(USDC_MINT, sender);
    const recipient_ata = getAssociatedTokenAddressSync(USDC_MINT, recipient);

    const recipient_ata_info = await connection.getAccountInfo(recipient_ata, 'confirmed');
    const creates_recipient_ata = recipient_ata_info === null;

    const instructions = [];
    if (creates_recipient_ata) {
        instructions.push(
            createAssociatedTokenAccountIdempotentInstruction(
                sender,
                recipient_ata,
                recipient,
                USDC_MINT,
            ),
        );
    }
    instructions.push(
        createTransferCheckedInstruction(
            sender_ata,
            USDC_MINT,
            recipient_ata,
            sender,
            raw_amount,
            USDC_DECIMALS,
        ),
    );

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const message = new TransactionMessage({
        payerKey: sender,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    return {
        transaction: new VersionedTransaction(message),
        creates_recipient_ata,
        recipient_ata,
        raw_amount,
    };
}
