'use client';

import { useEffect } from 'react';
import { SERVER_MESSAGE_TYPE } from '@solmarket/types';

import { useWebSocket } from './useWebSocket';
import { SocketEventHandlers } from './socket-event-handlers';
import SingletonSocket from './singleton-socket';

export function useSubscribeEventHandlers() {
    // Keep the socket alive for the lifetime of this consumer. The returned
    // `on/off` here close over a possibly-null React-derived `client`, so we
    // do NOT use them for handler registration — that's what `SingletonSocket`
    // is for. This call is purely for refcount + connection lifecycle.
    useWebSocket();

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handlers_map: Record<SERVER_MESSAGE_TYPE, (msg: any) => void> = {
            [SERVER_MESSAGE_TYPE.MARKET]: SocketEventHandlers.handle_market,
            [SERVER_MESSAGE_TYPE.SUBSCRIBED]: SocketEventHandlers.handle_subscribed,
            [SERVER_MESSAGE_TYPE.UNSUBSCRIBED]: SocketEventHandlers.handle_unsubscribed,
            [SERVER_MESSAGE_TYPE.ERROR]: SocketEventHandlers.handle_error,
            [SERVER_MESSAGE_TYPE.PONG]: SocketEventHandlers.handle_pong,
            [SERVER_MESSAGE_TYPE.MARKET_RESOLVED]: SocketEventHandlers.handle_market_resolved,
        };

        // Register synchronously against the singleton. SingletonSocket
        // attaches each handler to the current WebSocketClient (if any) AND
        // remembers it for replay onto any future client (reconnect, session
        // swap). This eliminates the prior race where the React-derived
        // `client` was null on the first commit and the server's initial
        // `book` frame arrived before re-registration on the second commit.
        for (const [type, handler] of Object.entries(handlers_map)) {
            SingletonSocket.on(type as SERVER_MESSAGE_TYPE, handler);
        }

        return () => {
            for (const [type, handler] of Object.entries(handlers_map)) {
                SingletonSocket.off(type as SERVER_MESSAGE_TYPE, handler);
            }
        };
    }, []);
}
