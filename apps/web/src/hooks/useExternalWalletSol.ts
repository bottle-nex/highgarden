'use client';
import { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

interface State {
    /** Decimal SOL balance (e.g. 1.5). `null` while loading or before connect. */
    ui_amount: number | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Reads the connected external wallet's native SOL balance. Mirrors
 * `useExternalWalletUsdc` but for the deposit-SOL flow (the user is
 * sending native SOL to their custodial address, not SPL USDC).
 */
export function useExternalWalletSol(): State {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const [ui_amount, set_ui_amount] = useState<number | null>(null);
    const [loading, set_loading] = useState(false);
    const [error, set_error] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!publicKey) {
            set_ui_amount(null);
            return;
        }
        set_loading(true);
        set_error(null);
        try {
            const lamports = await connection.getBalance(publicKey, 'confirmed');
            set_ui_amount(lamports / LAMPORTS_PER_SOL);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('[useExternalWalletSol] balance fetch failed', msg);
            set_error(msg);
            set_ui_amount(null);
        } finally {
            set_loading(false);
        }
    }, [connection, publicKey]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refetch();
    }, [refetch]);

    return { ui_amount, loading, error, refetch };
}
