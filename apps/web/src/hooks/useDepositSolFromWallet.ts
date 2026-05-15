'use client';
import { useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { apiClient } from '@/lib/client.axios';

export type SolDepositPhase =
    | 'idle'
    | 'building'
    | 'simulating'
    | 'awaiting-signature'
    | 'sending'
    | 'confirming'
    | 'notifying-server'
    | 'success'
    | 'error';

export interface SolDepositResult {
    signature: string;
    lamports: number;
}

interface State {
    phase: SolDepositPhase;
    error: string | null;
    last_signature: string | null;
    deposit: (input: { recipient: string; sol_amount: number }) => Promise<SolDepositResult | null>;
    reset: () => void;
}

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Sends SOL from the connected external wallet to the user's custodial
 * address, then pings `/users/me/check-deposits` so SolDepositPoller
 * picks it up immediately.
 *
 * Why this uses `signTransaction` instead of `sendTransaction`:
 * Phantom's `sendTransaction` runs ITS OWN pre-flight simulation against
 * ITS internal RPC. Phantom's default devnet RPC (api.devnet.solana.com)
 * is heavily rate-limited and frequently times out on simulation, so
 * Phantom shows the alarming "transaction reverted during simulation —
 * funds may be lost" warning even when the tx would actually succeed.
 * By signing locally and submitting via OUR Helius-backed connection,
 * we use the same RPC for simulation and submission, removing the
 * Phantom-side false-positive entirely.
 *
 * Phase progression:
 *   idle → building → simulating → awaiting-signature → sending
 *        → confirming → notifying-server → success
 */
export function useDepositSolFromWallet(): State {
    const { connection } = useConnection();
    const { publicKey, signTransaction } = useWallet();

    const [phase, set_phase] = useState<SolDepositPhase>('idle');
    const [error, set_error] = useState<string | null>(null);
    const [last_signature, set_last_signature] = useState<string | null>(null);

    const reset = useCallback(() => {
        set_phase('idle');
        set_error(null);
    }, []);

    const deposit = useCallback(
        async ({ recipient, sol_amount }: { recipient: string; sol_amount: number }) => {
            if (!publicKey) {
                set_error('Connect a wallet first');
                set_phase('error');
                return null;
            }
            if (!signTransaction) {
                set_error('This wallet does not support signing transactions');
                set_phase('error');
                return null;
            }
            try {
                set_error(null);
                set_phase('building');
                const recipient_pk = new PublicKey(recipient);
                const lamports = Math.round(sol_amount * LAMPORTS_PER_SOL);
                // Helpful diagnostic if the env-driven RPC ever falls back
                // to mainnet by accident — one glance at DevTools tells you.
                // eslint-disable-next-line no-console
                console.log('[sol-deposit] rpc endpoint:', connection.rpcEndpoint);
                const latest = await connection.getLatestBlockhash('confirmed');
                const tx = new Transaction({
                    feePayer: publicKey,
                    blockhash: latest.blockhash,
                    lastValidBlockHeight: latest.lastValidBlockHeight,
                }).add(
                    SystemProgram.transfer({
                        fromPubkey: publicKey,
                        toPubkey: recipient_pk,
                        lamports,
                    }),
                );

                // Pre-simulate against OUR RPC so a real failure surfaces
                // BEFORE we ask Phantom to sign — better UX than letting
                // Phantom show a generic warning then having the tx fail.
                set_phase('simulating');
                const sim = await connection.simulateTransaction(tx);
                if (sim.value.err) {
                    const logs = sim.value.logs?.slice(-3).join(' | ') ?? '';
                    throw new Error(
                        `Simulation failed: ${JSON.stringify(sim.value.err)} ${logs}`,
                    );
                }

                set_phase('awaiting-signature');
                const signed = await signTransaction(tx);

                set_phase('sending');
                const signature = await connection.sendRawTransaction(signed.serialize(), {
                    preflightCommitment: 'confirmed',
                    // Pre-simulated above; skip the redundant preflight on
                    // submit to avoid double-charging RPC quota.
                    skipPreflight: true,
                });

                set_phase('confirming');
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

                // Trigger the server poller now so the user sees their USDC
                // appear within seconds instead of waiting up to the poll
                // interval (~30s by default).
                set_phase('notifying-server');
                try {
                    await apiClient.post('/users/me/check-deposits');
                } catch {
                    // Non-fatal — the periodic poll will pick it up later.
                }

                set_last_signature(signature);
                set_phase('success');
                return { signature, lamports };
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                set_error(normalize_wallet_error(message));
                set_phase('error');
                return null;
            }
        },
        [connection, publicKey, signTransaction],
    );

    return { phase, error, last_signature, deposit, reset };
}

function normalize_wallet_error(message: string): string {
    if (/User rejected|user rejected/.test(message)) return 'You rejected the request';
    if (/insufficient lamports|insufficient funds/i.test(message)) {
        return 'Wallet does not have enough SOL to cover this transfer and fees';
    }
    return message;
}
