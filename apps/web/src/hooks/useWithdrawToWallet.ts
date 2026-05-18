'use client';
import { useCallback, useState } from 'react';
import withdraw_api, { WithdrawError } from '@/lib/api/withdraw';

export type WithdrawPhase = 'idle' | 'submitting' | 'success' | 'error';

interface State {
    phase: WithdrawPhase;
    error: string | null;
    last_signature: string | null;
    withdraw: (input: { destination: string; ui_amount: number }) => Promise<void>;
    reset: () => void;
}

/**
 * Backend-signed withdrawal. The user doesn't sign anything client-side —
 * the server loads the user's custodial keypair, signs the SPL transfer,
 * and pays the SOL tx fee out of the admin keypair. So the entire flow
 * here is a single POST with a phase machine for the UI.
 */
export function useWithdrawToWallet(): State {
    const [phase, set_phase] = useState<WithdrawPhase>('idle');
    const [error, set_error] = useState<string | null>(null);
    const [last_signature, set_last_signature] = useState<string | null>(null);

    const reset = useCallback(() => {
        set_phase('idle');
        set_error(null);
    }, []);

    const withdraw = useCallback(
        async ({ destination, ui_amount }: { destination: string; ui_amount: number }) => {
            try {
                set_error(null);
                set_phase('submitting');
                const result = await withdraw_api.withdraw_usdc({ destination, ui_amount });
                set_last_signature(result.txSignature);
                set_phase('success');
            } catch (e) {
                const message =
                    e instanceof WithdrawError
                        ? e.user_message
                        : e instanceof Error
                          ? e.message
                          : 'Withdrawal failed';
                set_error(message);
                set_phase('error');
            }
        },
        [],
    );

    return { phase, error, last_signature, withdraw, reset };
}
