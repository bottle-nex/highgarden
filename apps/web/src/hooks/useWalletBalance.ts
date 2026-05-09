'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetch_user_wallet, type WalletSnapshot } from '@/lib/api/wallet';

interface State {
    data: WalletSnapshot | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

export function useWalletBalance(opts: { enabled: boolean }): State {
    const [data, set_data] = useState<WalletSnapshot | null>(null);
    const [loading, set_loading] = useState(false);
    const [error, set_error] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        set_loading(true);
        set_error(null);
        try {
            const snap = await fetch_user_wallet();
            set_data(snap);
        } catch (e) {
            set_error(e instanceof Error ? e.message : 'unknown error');
        } finally {
            set_loading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (opts.enabled) void refetch();
    }, [opts.enabled, refetch]);

    return { data, loading, error, refetch };
}
