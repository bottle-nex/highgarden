'use client';
import { useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { build_usdc_transfer } from '@/lib/solana/usdc-transfer';

export type DepositPhase =
    | 'idle'
    | 'building'
    | 'simulating'
    | 'awaiting-signature'
    | 'sending'
    | 'confirming'
    | 'success'
    | 'error';

export interface DepositResult {
    signature: string;
    creates_recipient_ata: boolean;
}

interface State {
    phase: DepositPhase;
    error: string | null;
    last_signature: string | null;
    deposit: (input: { recipient: string; ui_amount: number }) => Promise<DepositResult | null>;
    reset: () => void;
}

/**
 * Orchestrates a USDC deposit from the connected external wallet to the user's
 * custodial address. Phases let the UI render fine-grained progress; on failure
 * the rejection reason / RPC error is surfaced and the phase is left at 'error'
 * until `reset()` is called.
 *
 * Always simulates the transaction before requesting a signature so the user
 * sees a clear failure (e.g. insufficient SOL for ATA rent) before signing.
 */
export function useDepositFromWallet(): State {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const [phase, set_phase] = useState<DepositPhase>('idle');
    const [error, set_error] = useState<string | null>(null);
    const [last_signature, set_last_signature] = useState<string | null>(null);

    const reset = useCallback(() => {
        set_phase('idle');
        set_error(null);
    }, []);

    const deposit = useCallback(
        async ({ recipient, ui_amount }: { recipient: string; ui_amount: number }) => {
            if (!publicKey) {
                set_error('Connect a wallet first');
                set_phase('error');
                return null;
            }

            try {
                set_error(null);
                set_phase('building');
                const recipient_pk = new PublicKey(recipient);
                const built = await build_usdc_transfer({
                    connection,
                    sender: publicKey,
                    recipient: recipient_pk,
                    ui_amount,
                });

                set_phase('simulating');
                const sim = await connection.simulateTransaction(built.transaction, {
                    sigVerify: false,
                    commitment: 'confirmed',
                });
                if (sim.value.err) {
                    const logs = sim.value.logs?.slice(-3).join(' | ') ?? '';
                    throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)} ${logs}`);
                }

                set_phase('awaiting-signature');
                const signature = await sendTransaction(built.transaction, connection);

                set_phase('confirming');
                const latest = await connection.getLatestBlockhash('confirmed');
                const result = await connection.confirmTransaction(
                    {
                        signature,
                        blockhash: latest.blockhash,
                        lastValidBlockHeight: latest.lastValidBlockHeight,
                    },
                    'confirmed',
                );
                if (result.value.err) {
                    throw new Error(`Confirmation failed: ${JSON.stringify(result.value.err)}`);
                }

                set_last_signature(signature);
                set_phase('success');
                return { signature, creates_recipient_ata: built.creates_recipient_ata };
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                set_error(normalize_wallet_error(message));
                set_phase('error');
                return null;
            }
        },
        [connection, publicKey, sendTransaction],
    );

    return { phase, error, last_signature, deposit, reset };
}

function normalize_wallet_error(message: string): string {
    if (/User rejected|user rejected/.test(message)) return 'You rejected the request';
    if (/insufficient lamports|insufficient funds/i.test(message)) {
        return 'Wallet does not have enough SOL to cover network fees';
    }
    return message;
}
