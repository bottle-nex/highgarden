'use client';

import { useEffect } from 'react';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import SingletonSocket from '@/lib/socket/singleton-socket';

/**
 * Holds an app-level refcount on the WS singleton for as long as the user is
 * authenticated. Mounted once at the root layout, so navigation between pages
 * (e.g. /event/A → /event/B) can never bring the refcount to zero — the
 * underlying WebSocket survives across routes. Released only when the user
 * logs out (token becomes null) or the tab unloads.
 */
export default function WebSocketHost() {
    const session = useUserSessionStore((s) => s.session);
    const token = session?.user?.token ?? null;

    useEffect(() => {
        if (!token) return;
        SingletonSocket.acquire(token);
        return () => {
            SingletonSocket.release();
        };
    }, [token]);

    return null;
}
