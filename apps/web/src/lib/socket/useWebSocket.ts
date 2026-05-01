'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    CLIENT_MESSAGE_TYPE,
    SERVER_MESSAGE_TYPE,
    type ServerMessageHandler,
} from '@solmarket/types';

import WebSocketClient from './socket.client';
import { useStreamStore } from '@/store/stream/useStreamStore';
import { useMarketsStore } from '@/store/markets/useMarketsStore';
import { useUserSessionStore } from '@/store/user/useUserSessionStore';
import SingletonSocket from './singleton-socket';

export function useWebSocket() {
    // Client lives in state, not a ref, so consumers re-render when the WS
    // becomes available. Subscribe / handler effects close over `client`
    // through useCallback deps and re-fire once it transitions null → ws.
    const [client, set_client] = useState<WebSocketClient | null>(null);
    const session = useUserSessionStore((s) => s.session);
    const token = session?.user?.token ?? null;

    useEffect(() => {
        if (!token) return;

        const ws = SingletonSocket.acquire(token);
        set_client(ws);
        useStreamStore.getState().setStatus('connecting');

        // Reflect WebSocket readyState changes into the stream store
        const poll = setInterval(() => {
            const s = ws.get_status();
            const status = useStreamStore.getState().status;

            if (s.is_connected && status !== 'open') {
                useStreamStore.getState().setStatus('open');
            } else if (!s.is_connected && !s.is_manually_closed && status === 'open') {
                useStreamStore.getState().setStatus('reconnecting');
                useStreamStore.getState().markAllStale();
            } else if (s.is_manually_closed && status !== 'closed') {
                useStreamStore.getState().setStatus('closed');
            }
        }, 500);

        return () => {
            clearInterval(poll);
            SingletonSocket.release();
            set_client(null);
        };
    }, [token]);

    const subscribe_market = useCallback(
        (marketId: string) => {
            if (!client) return;

            const market = useMarketsStore.getState().byId[marketId];
            if (!market) return;

            const is_first = useStreamStore.getState().addSubscriber(marketId);
            if (!is_first) return;

            if (market.yesTokenId)
                client.send({ type: CLIENT_MESSAGE_TYPE.SUBSCRIBE, token_id: market.yesTokenId });
            if (market.noTokenId)
                client.send({ type: CLIENT_MESSAGE_TYPE.SUBSCRIBE, token_id: market.noTokenId });
        },
        [client],
    );

    const unsubscribe_market = useCallback(
        (marketId: string) => {
            if (!client) return;

            const market = useMarketsStore.getState().byId[marketId];
            if (!market) return;

            const is_last = useStreamStore.getState().removeSubscriber(marketId);
            if (!is_last) return;

            if (market.yesTokenId)
                client.send({ type: CLIENT_MESSAGE_TYPE.UNSUBSCRIBE, token_id: market.yesTokenId });
            if (market.noTokenId)
                client.send({ type: CLIENT_MESSAGE_TYPE.UNSUBSCRIBE, token_id: market.noTokenId });
        },
        [client],
    );

    const on = useCallback(
        <T extends SERVER_MESSAGE_TYPE>(type: T, handler: ServerMessageHandler<T>) => {
            client?.on(type, handler);
        },
        [client],
    );

    const off = useCallback(
        <T extends SERVER_MESSAGE_TYPE>(type: T, handler: ServerMessageHandler<T>) => {
            client?.off(type, handler);
        },
        [client],
    );

    const ping = useCallback(() => {
        client?.ping();
    }, [client]);

    return {
        socket: client,
        is_connected: client?.is_connected ?? false,
        subscribe_market,
        unsubscribe_market,
        on,
        off,
        ping,
    };
}

export function useMarketStream(marketId: string | null | undefined) {
    const { subscribe_market, unsubscribe_market } = useWebSocket();

    useEffect(() => {
        if (!marketId) return;
        subscribe_market(marketId);
        return () => unsubscribe_market(marketId);
    }, [marketId, subscribe_market, unsubscribe_market]);
}
