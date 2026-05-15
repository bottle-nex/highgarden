'use client';

import { useEffect } from 'react';
import { SERVER_MESSAGE_TYPE } from '@solmarket/types';

import { useWebSocket } from './useWebSocket';
import { SocketEventHandlers } from './socket-event-handlers';

export function useSubscribeEventHandlers() {
    const { on, off } = useWebSocket();

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handlersMap: Record<SERVER_MESSAGE_TYPE, (msg: any) => void> = {
            [SERVER_MESSAGE_TYPE.MARKET]: SocketEventHandlers.handle_market,
            [SERVER_MESSAGE_TYPE.SUBSCRIBED]: SocketEventHandlers.handle_subscribed,
            [SERVER_MESSAGE_TYPE.UNSUBSCRIBED]: SocketEventHandlers.handle_unsubscribed,
            [SERVER_MESSAGE_TYPE.ERROR]: SocketEventHandlers.handle_error,
            [SERVER_MESSAGE_TYPE.PONG]: SocketEventHandlers.handle_pong,
            [SERVER_MESSAGE_TYPE.MARKET_RESOLVED]: SocketEventHandlers.handle_market_resolved,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscribe = on as (type: SERVER_MESSAGE_TYPE, handler: (msg: any) => void) => void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unsubscribe = off as (type: SERVER_MESSAGE_TYPE, handler: (msg: any) => void) => void;

        // subscribe
        Object.entries(handlersMap).forEach(([type, handler]) =>
            subscribe(type as SERVER_MESSAGE_TYPE, handler),
        );

        // unsubscribe
        return () => {
            Object.entries(handlersMap).forEach(([type, handler]) =>
                unsubscribe(type as SERVER_MESSAGE_TYPE, handler),
            );
        };
    }, [on, off]);
}
