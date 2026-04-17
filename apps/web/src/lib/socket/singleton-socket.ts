import WebSocketClient from './socket.client';

export default class SingletonSocket {

    private static client: WebSocketClient | null = null;

    private static get_ws_url(token: string): string {
        const backend = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8080';
        const url = new URL(backend);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.pathname = '/ws';
        url.searchParams.set('token', token);
        return url.toString();
    }

    public static get_socket_client(token: string): WebSocketClient {
        if (this.client) return this.client;
        this.client = new WebSocketClient(this.get_ws_url(token));
        return this.client;
    }

    public static destroy_socket_client(): void {
        if (this.client) this.client.close();
        this.client = null;
    }

    public static get_current_client(): WebSocketClient | null {
        return this.client;
    }

}