'use client';

import { useEffect } from 'react';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import SingletonSocket from '@/lib/socket/singleton-socket';

/**
 * Holds an app-level refcount on the WS singleton for the lifetime of the tab.
 * Mounted once at the root layout, so navigation between pages
 * (e.g. /event/A → /event/B) can never bring the refcount to zero — the
 * underlying WebSocket survives across routes.
 *
 * Connects unconditionally (guests included) — public market-data channels
 * are open to anyone, matching how Polymarket / Kalshi / dYdX expose their
 * sockets. When the auth token changes (sign-in or sign-out), the singleton
 * tears down the old connection and opens a new one with the new identity.
 */
export default function WebSocketHost() {
    const session = useUserSessionStore((s) => s.session);
    const token = session?.user?.token ?? null;

    useEffect(() => {
        SingletonSocket.acquire(token);
        return () => {
            SingletonSocket.release();
        };
    }, [token]);

    return null;
}
