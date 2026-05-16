import {
    SERVER_MESSAGE_TYPE,
    CLIENT_MESSAGE_TYPE,
    SERVER_CLOSE_CODES,
    isIntentionalClosure,
    type ServerMessage,
    type ClientMessage,
    type ServerMessageHandler,
} from '@solmarket/types';

export default class WebSocketClient {
    private ws!: WebSocket;
    public is_connected: boolean = false;
    private url: string;
    private reconnect_attempts = 0;
    private max_reconnect_attempts = 5;
    private reconnect_timeout: ReturnType<typeof setTimeout> | null = null;
    private reconnect_delay: number = 1000;
    private max_reconnect_delay: number = 30000;
    private persistent_reconnect_delay: number = 5000;
    private message_queue: ClientMessage[] = [];
    // Authoritative set of subscriptions held by this client. Used to replay
    // SUBSCRIBE frames on every (re)connect so the server, which forgets per-
    // socket subscriptions on close, can rebuild its routing table.
    private active_subscriptions: Set<string> = new Set();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private handlers: Map<SERVER_MESSAGE_TYPE, ((msg: any) => void)[]> = new Map();
    private is_manually_closed: boolean = false;

    constructor(url: string) {
        this.url = url;
        this.is_manually_closed = false;
        this.initialize_connection();
    }

    private initialize_connection() {
        if (this.is_manually_closed) return;

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            this.is_connected = true;
            this.reconnect_attempts = 0;
            this.reconnect_delay = 1000;
            this.replay_subscriptions();
            this.flush_message_queue();
        };

        this.ws.onmessage = (event: MessageEvent<string>) => {
            try {
                const msg: ServerMessage = JSON.parse(event.data);
                this.handle_incoming_message(msg);
            } catch (error) {
                console.error('[ws:client] failed to parse message:', event.data, error);
            }
        };

        this.ws.onclose = (event: CloseEvent) => {
            this.is_connected = false;

            if (this.reconnect_timeout) {
                clearTimeout(this.reconnect_timeout);
                this.reconnect_timeout = null;
            }

            this.handle_close_code(event.code);

            if (!this.is_manually_closed && !isIntentionalClosure(event.code)) {
                this.attempt_reconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('[ws:client] error:', error);
        };
    }

    private handle_close_code(code: number): void {
        switch (code) {
            case SERVER_CLOSE_CODES.AUTH_REQUIRED:
                console.warn(
                    '[ws:client] authentication required — re-authenticate and reconnect.',
                );
                this.is_manually_closed = true;
                break;
            case SERVER_CLOSE_CODES.SESSION_EXPIRED:
                console.warn('[ws:client] session expired — refresh your session.');
                this.is_manually_closed = true;
                break;
            case SERVER_CLOSE_CODES.SERVER_SHUTDOWN:
                console.warn('[ws:client] server shutting down — will attempt reconnect.');
                break;
            default:
                break;
        }
    }

    private handle_incoming_message(msg: ServerMessage): void {
        const handlers = this.handlers.get(msg.type);
        if (handlers) {
            handlers.forEach((h) => h(msg as never));
        }
    }

    public on<T extends SERVER_MESSAGE_TYPE>(type: T, handler: ServerMessageHandler<T>): void {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, []);
        }
        this.handlers.get(type)!.push(handler);
    }

    public off<T extends SERVER_MESSAGE_TYPE>(type: T, handler: ServerMessageHandler<T>): void {
        const list = this.handlers.get(type);
        if (!list) return;
        const index = list.indexOf(handler);
        if (index !== -1) list.splice(index, 1);
        if (list.length === 0) this.handlers.delete(type);
    }

    public send(msg: ClientMessage): void {
        if (msg.type === CLIENT_MESSAGE_TYPE.SUBSCRIBE) {
            // Dedupe: if this token is already in our subscription set, the
            // server already has the subscription (either from replay-on-open
            // or a prior wire send). Re-sending would trigger an "already
            // subscribed" error from the server, which is harmless but ugly.
            // We still ensure it's in active_subscriptions so a future
            // (re)connect's replay picks it up.
            const newly_added = !this.active_subscriptions.has(msg.token_id);
            this.active_subscriptions.add(msg.token_id);
            if (!newly_added && this.is_connected && this.ws.readyState === WebSocket.OPEN) {
                return;
            }
        } else if (msg.type === CLIENT_MESSAGE_TYPE.UNSUBSCRIBE) {
            this.active_subscriptions.delete(msg.token_id);
        }

        if (this.is_connected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        } else if (
            msg.type !== CLIENT_MESSAGE_TYPE.SUBSCRIBE &&
            msg.type !== CLIENT_MESSAGE_TYPE.UNSUBSCRIBE
        ) {
            // Subscriptions are replayed from active_subscriptions on (re)connect,
            // so we don't queue them here — that would risk duplicate sends.
            this.message_queue.push(msg);
        }
    }

    /**
     * Carry-over support: read & seed the active subscription set without
     * touching the wire. Used by SingletonSocket on a session swap (sign-in
     * / sign-out) to migrate subscriptions from the closing client to the
     * fresh one — replay_subscriptions will re-subscribe them on open.
     */
    public get_active_subscriptions(): ReadonlySet<string> {
        return this.active_subscriptions;
    }

    public seed_active_subscriptions(token_ids: Iterable<string>): void {
        for (const id of token_ids) this.active_subscriptions.add(id);
    }

    private replay_subscriptions(): void {
        if (this.active_subscriptions.size === 0) return;
        for (const token_id of this.active_subscriptions) {
            this.ws.send(JSON.stringify({ type: CLIENT_MESSAGE_TYPE.SUBSCRIBE, token_id }));
        }
    }

    public subscribe_market(token_id: string): void {
        this.send({ type: CLIENT_MESSAGE_TYPE.SUBSCRIBE, token_id });
    }

    public unsubscribe_market(token_id: string): void {
        this.send({ type: CLIENT_MESSAGE_TYPE.UNSUBSCRIBE, token_id });
    }

    public ping(): void {
        this.send({ type: CLIENT_MESSAGE_TYPE.PING });
    }

    private attempt_reconnect(): void {
        if (this.is_manually_closed) return;

        this.reconnect_attempts++;

        let delay: number;

        if (this.reconnect_attempts <= this.max_reconnect_attempts) {
            delay = this.reconnect_delay;
            this.reconnect_delay = Math.min(this.reconnect_delay * 2, this.max_reconnect_delay);
        } else {
            console.warn(
                `[ws:client] max reconnection attempts (${this.max_reconnect_attempts}) reached — switching to persistent mode.`,
            );
            delay = this.persistent_reconnect_delay;
            this.reconnect_delay = 1000;
        }

        this.reconnect_timeout = setTimeout(() => {
            if (!this.is_manually_closed) this.initialize_connection();
        }, delay);
    }

    private flush_message_queue(): void {
        while (this.message_queue.length > 0) {
            const msg = this.message_queue.shift();
            if (msg) this.send(msg);
        }
    }

    public close(code: number = 1000, reason: string = 'Client disconnect'): void {
        this.is_manually_closed = true;

        if (this.reconnect_timeout) {
            clearTimeout(this.reconnect_timeout);
            this.reconnect_timeout = null;
        }

        if (
            this.ws &&
            (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
        ) {
            this.ws.close(code, reason);
        }

        this.is_connected = false;
        this.handlers.clear();
        this.message_queue = [];
        this.active_subscriptions.clear();
    }

    public get_status() {
        return {
            is_connected: this.is_connected,
            reconnect_attempts: this.reconnect_attempts,
            queued_messages: this.message_queue.length,
            is_manually_closed: this.is_manually_closed,
        };
    }
}
