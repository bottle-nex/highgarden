'use client';
import { useCallback, useState } from 'react';
import withdraw_api, { WithdrawError } from '@/lib/api/withdraw';

export type WithdrawPhase =
    | 'idle'
    | 'requesting'
    | 'confirming'
    | 'submitting'
    | 'success'
    | 'error';

interface State {
    phase: WithdrawPhase;
    error: string | null;
    last_signature: string | null;
    request_confirmation: (input: { destination: string; ui_amount: number }) => Promise<boolean>;
    withdraw: (input: { destination: string; ui_amount: number; code: string }) => Promise<void>;
    reset: () => void;
}

/** Email approval precedes the server-signed custodial transfer. */
export function useWithdrawToWallet(): State {
    const [phase, set_phase] = useState<WithdrawPhase>('idle');
    const [error, set_error] = useState<string | null>(null);
    const [last_signature, set_last_signature] = useState<string | null>(null);

    const reset = useCallback(() => {
        set_phase('idle');
        set_error(null);
    }, []);

    const request_confirmation = useCallback(
        async (input: { destination: string; ui_amount: number }) => {
            set_error(null);
            set_phase('requesting');
            try {
                await withdraw_api.request_confirmation(input);
                set_phase('confirming');
                return true;
            } catch (error) {
                set_error(error instanceof Error ? error.message : 'Could not send confirmation');
                set_phase('error');
                return false;
            }
        },
        [],
    );

    const withdraw = useCallback(
        async ({
            destination,
            ui_amount,
            code,
        }: {
            destination: string;
            ui_amount: number;
            code: string;
        }) => {
            try {
                set_error(null);
                set_phase('submitting');
                const result = await withdraw_api.withdraw_usdc({ destination, ui_amount, code });
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

    return { phase, error, last_signature, request_confirmation, withdraw, reset };
}
