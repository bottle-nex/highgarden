'use client';

import { useEffect, useRef, useCallback } from 'react';
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
    const socket = useRef<WebSocketClient | null>(null);
    const session = useUserSessionStore((s) => s.session);
    const token = session?.user?.token ?? null;

    useEffect(() => {
        if (!token) return;

        const ws = SingletonSocket.acquire(token);
        socket.current = ws;
        useStreamStore.getState().setStatus('connecting');

        // Reflect WebSocket readyState changes into the stream store
        const poll = setInterval(() => {
            if (!socket.current) return;
            const s = socket.current.get_status();
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
            // Release BEFORE nulling — unsubscribe_market cleanup (registered
            // after this effect) still reads socket.current. Nulling here would
            // fire first (same component, forward cleanup order) and cause
            // unsubscribe_market to bail early, leaving the server subscribed.
            SingletonSocket.release();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const subscribe_market = useCallback((marketId: string) => {
        const ws = socket.current;
        if (!ws) return;

        const market = useMarketsStore.getState().byId[marketId];
        if (!market) return;

        const is_first = useStreamStore.getState().addSubscriber(marketId);
        if (!is_first) return;

        if (market.yesTokenId)
            ws.send({ type: CLIENT_MESSAGE_TYPE.SUBSCRIBE, token_id: market.yesTokenId });
        if (market.noTokenId)
            ws.send({ type: CLIENT_MESSAGE_TYPE.SUBSCRIBE, token_id: market.noTokenId });
    }, []);

    const unsubscribe_market = useCallback((marketId: string) => {
        const ws = socket.current;
        if (!ws) return;

        const market = useMarketsStore.getState().byId[marketId];
        if (!market) return;

        const is_last = useStreamStore.getState().removeSubscriber(marketId);
        if (!is_last) return;

        if (market.yesTokenId)
            ws.send({ type: CLIENT_MESSAGE_TYPE.UNSUBSCRIBE, token_id: market.yesTokenId });
        if (market.noTokenId)
            ws.send({ type: CLIENT_MESSAGE_TYPE.UNSUBSCRIBE, token_id: market.noTokenId });
    }, []);

    const on = useCallback(
        <T extends SERVER_MESSAGE_TYPE>(type: T, handler: ServerMessageHandler<T>) => {
            socket.current?.on(type, handler);
        },
        [],
    );

    const off = useCallback(
        <T extends SERVER_MESSAGE_TYPE>(type: T, handler: ServerMessageHandler<T>) => {
            socket.current?.off(type, handler);
        },
        [],
    );

    const ping = useCallback(() => {
        socket.current?.ping();
    }, []);

    return {
        socket: socket.current,
        is_connected: socket.current?.is_connected ?? false,
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
