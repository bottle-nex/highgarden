import WebSocketClient from './socket.client';
import { useStreamStore } from '@/store/stream/useStreamStore';

export default class SingletonSocket {
    private static client: WebSocketClient | null = null;
    private static refcount = 0;
    // Deferred close — guards against React StrictMode's mount→cleanup→mount cycle
    // and back-to-back consumer swaps from tearing the live socket down.
    private static destroy_timeout: ReturnType<typeof setTimeout> | null = null;
    private static readonly destroy_grace_ms = 250;

    private static get_ws_url(token: string): string {
        const backend = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';
        const url = new URL(backend);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.pathname = '/ws';
        url.searchParams.set('token', token);
        return url.toString();
    }

    public static acquire(token: string): WebSocketClient {
        if (this.destroy_timeout) {
            clearTimeout(this.destroy_timeout);
            this.destroy_timeout = null;
        }
        this.refcount++;
        if (!this.client) {
            this.client = new WebSocketClient(this.get_ws_url(token));
        }
        return this.client;
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
