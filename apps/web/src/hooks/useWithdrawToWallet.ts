'use client';
import { useCallback, useEffect, useState } from 'react';
import withdraw_api, { WithdrawError, type WithdrawalIntent } from '@/lib/api/withdraw';

export type WithdrawPhase = 'idle' | 'approval' | 'submitting' | 'pending' | 'success' | 'error';

export function useWithdrawToWallet() {
    const [phase, set_phase] = useState<WithdrawPhase>('idle');
    const [error, set_error] = useState<string | null>(null);
    const [intent, set_intent] = useState<WithdrawalIntent | null>(null);
    const [last_signature, set_last_signature] = useState<string | null>(null);
    const message = (err: unknown) =>
        err instanceof WithdrawError
            ? err.user_message
            : err instanceof Error
              ? err.message
              : 'Withdrawal failed';
    const accept = useCallback((next: WithdrawalIntent) => {
        set_intent(next);
        if (next.status === 'CONFIRMED') {
            set_last_signature(next.txSignature);
            set_phase('success');
            set_error(null);
        } else if (['FAILED', 'CANCELLED'].includes(next.status)) {
            set_error(next.failure ?? 'Request a fresh code to try again.');
            set_phase('error');
        } else set_phase(next.status === 'AWAITING_APPROVAL' ? 'approval' : 'pending');
    }, []);

    const reset = useCallback(() => {
        set_phase('idle');
        set_error(null);
        set_intent(null);
        set_last_signature(null);
    }, []);

    const withdraw = useCallback(
        async ({ destination, ui_amount }: { destination: string; ui_amount: number }) => {
            set_error(null);
            set_phase('submitting');
            try {
                accept(await withdraw_api.request(destination, ui_amount));
            } catch (err) {
                set_error(message(err));
                set_phase('error');
            }
        },
        [accept],
    );

    const confirm = useCallback(
        async (code: string) => {
            if (!intent) return;
            set_phase('submitting');
            set_error(null);
            try {
                accept(await withdraw_api.confirm(intent.id, code));
            } catch (err) {
                set_error(message(err));
                // A lost response may already have consumed the code. Query the
                // same intent before offering another action.
                set_phase('pending');
            }
        },
        [intent, accept],
    );

    useEffect(() => {
        if (phase !== 'pending' || !intent) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const next = await withdraw_api.status(intent.id);
                if (!stopped) accept(next);
            } catch {
                /* Keep this intent pending on network errors. */
            }
            if (!stopped)
                timer = setTimeout(() => {
                    void poll();
                }, 3000);
        };
        timer = setTimeout(() => {
            void poll();
        }, 1000);
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [phase, intent, accept]);

    return { phase, error, intent, last_signature, withdraw, confirm, reset };
}
