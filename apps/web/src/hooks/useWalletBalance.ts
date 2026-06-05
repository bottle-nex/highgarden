'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetch_user_wallet, type WalletSnapshot } from '@/lib/api/wallet';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';

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
    // Gate on session: NextAuth resolves a tick after mount, and the axios
    // interceptor pulls the bearer token from this store. Firing the fetch
    // before `session` lands sends an unauthenticated request the server
    // rejects with 401 — the hook used to wedge in that state forever
    // because it had no dependency on session and never retried.
    const session = useUserSessionStore((s) => s.session);

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
        if (!opts.enabled) return;
        if (!session) {
            set_data(null);
            set_error(null);
            return;
        }
        void refetch();
    }, [opts.enabled, session, refetch]);

    return { data, loading, error, refetch };
}
