import { SERVER_MESSAGE_TYPE, type ServerMessageHandler } from '@solmarket/types';

import WebSocketClient from './socket.client';
import { useStreamStore } from '@/store/stream/useStreamStore';

export default class SingletonSocket {
    private static client: WebSocketClient | null = null;
    private static refcount = 0;
    // The token associated with the live socket — used to detect a session
    // change (sign-in / sign-out) and force a reconnect with the new identity.
    private static current_token: string | null = null;
    // Deferred close — guards against React StrictMode's mount→cleanup→mount cycle
    // and back-to-back consumer swaps from tearing the live socket down.
    private static destroy_timeout: ReturnType<typeof setTimeout> | null = null;
    private static readonly destroy_grace_ms = 250;
    // Handlers attached at the singleton level (not per-client). Registering
    // here survives client recreation (session swap / reconnect) AND avoids
    // the React-render race where the consumer hook's `client` closure is
    // still null on the first render after mount — that closure-null window
    // was previously dropping the server's initial `book` snapshot, leaving
    // the orderbook stuck on the REST seed until a navigation forced a fresh
    // SUBSCRIBE.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static readonly handlers: Map<SERVER_MESSAGE_TYPE, Array<(msg: any) => void>> =
        new Map();

    private static get_ws_url(token: string | null): string {
        const backend = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';
        const url = new URL(backend);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.pathname = '/ws';
        // Authed users include their JWT; guests connect without one and the
        // server accepts them as anonymous, allowing only public market data.
        if (token) url.searchParams.set('token', token);
        return url.toString();
    }

    public static acquire(token: string | null): WebSocketClient {
        if (this.destroy_timeout) {
            clearTimeout(this.destroy_timeout);
            this.destroy_timeout = null;
        }
        // Token changed (sign-in/out) while a socket was live — tear down the
        // old connection and open a fresh one with the new identity. We carry
        // over the OLD client's active subscriptions to the NEW client so the
        // replay-on-open path re-subscribes everything the user was watching.
        // Without this, a sign-in mid-page leaves the new socket connected but
        // with no SUBSCRIBE messages flowing, because React effects' cleanup-
        // then-setup ordering doesn't reliably re-issue subscribes after the
        // singleton swap.
        if (this.client && this.current_token !== token) {
            const carry_over = Array.from(this.client.get_active_subscriptions());
            this.client.close(1000, 'session changed');
            this.client = null;
            useStreamStore.getState().reset();
            this.current_token = token;
            this.client = new WebSocketClient(this.get_ws_url(token));
            this.replay_handlers_onto(this.client);
            if (carry_over.length > 0) {
                this.client.seed_active_subscriptions(carry_over);
            }
        }
        this.refcount++;
        if (!this.client) {
            this.current_token = token;
            this.client = new WebSocketClient(this.get_ws_url(token));
            this.replay_handlers_onto(this.client);
        }
        return this.client;
    }

    /**
     * Register a message handler at the singleton level. The handler is
     * stored in a static map AND attached to the current client (if any).
     * On every subsequent client creation (reconnect / session swap),
     * `replay_handlers_onto` re-attaches it, so handlers outlive any one
     * WebSocketClient instance.
     */
    public static on<T extends SERVER_MESSAGE_TYPE>(
        type: T,
        handler: ServerMessageHandler<T>,
    ): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = this.handlers.get(type) ?? ([] as Array<(msg: any) => void>);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        list.push(handler as (msg: any) => void);
        this.handlers.set(type, list);
        this.client?.on(type, handler);
    }

    public static off<T extends SERVER_MESSAGE_TYPE>(
        type: T,
        handler: ServerMessageHandler<T>,
    ): void {
        const list = this.handlers.get(type);
        if (list) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const idx = list.indexOf(handler as (msg: any) => void);
            if (idx !== -1) list.splice(idx, 1);
            if (list.length === 0) this.handlers.delete(type);
        }
        this.client?.off(type, handler);
    }

    private static replay_handlers_onto(client: WebSocketClient): void {
        for (const [type, list] of this.handlers) {
            for (const handler of list) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client.on(type, handler as any);
            }
        }
    }

    public static release(): void {
        if (this.refcount === 0) return;
        this.refcount--;
        if (this.refcount > 0) return;

        if (this.destroy_timeout) clearTimeout(this.destroy_timeout);
        this.destroy_timeout = setTimeout(() => {
            this.destroy_timeout = null;
            if (this.refcount === 0 && this.client) {
                this.client.close();
                this.client = null;
                this.current_token = null;
                // Stream-store state (refcounts, status) is bound to the lifetime
                // of the WS singleton — reset only here, not on per-hook cleanup.
                useStreamStore.getState().reset();
            }
        }, this.destroy_grace_ms);
    }

    public static get_current_client(): WebSocketClient | null {
        return this.client;
    }
}
