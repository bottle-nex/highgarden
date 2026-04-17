import {
    MESSAGE_TYPES,
    SERVER_CLOSE_CODES,
    isIntentionalClosure,
    type AnyMessagePayload,
    type MessageHandler,
    type MessagePayload,
    type ParsedMessage,
} from '@solmarket/types';

export {
    MESSAGE_TYPES,
    SERVER_CLOSE_CODES,
    type AnyMessagePayload,
    type MessageHandler,
    type MessagePayload,
    type MessagePayloadMap,
    type ParsedMessage,
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
    private message_queue: AnyMessagePayload[] = [];
    private handlers: Map<string, MessageHandler[]> = new Map();
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
            this.flush_message_queue();
        };

        this.ws.onmessage = (event: MessageEvent<string>) => {
            try {
                const parsed_data: ParsedMessage = JSON.parse(event.data);
                this.handle_incoming_message(parsed_data);
            } catch (error) {
                console.error('Failed to parse incoming WebSocket message:', event.data, error);
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
            console.error('WebSocket error:', error);
        };
    }

    private handle_close_code(code: number) {
        switch (code) {
            case SERVER_CLOSE_CODES.AUTH_REQUIRED:
                console.warn('WebSocket: authentication required — re-authenticate and reconnect.');
                this.is_manually_closed = true;
                break;
            case SERVER_CLOSE_CODES.SESSION_EXPIRED:
                console.warn('WebSocket: session expired — refresh your session.');
                this.is_manually_closed = true;
                break;
            case SERVER_CLOSE_CODES.SERVER_SHUTDOWN:
                console.warn('WebSocket: server shutting down — will attempt reconnect.');
                break;
            default:
                break;
        }
    }

    private handle_incoming_message(parsed_data: ParsedMessage) {
        const { type, payload } = parsed_data;
        const handlers = this.handlers.get(type);
        if (handlers) {
            handlers.forEach((handler) => handler(payload as never));
        }
    }

    public subscribe<T extends MESSAGE_TYPES>(type: T, handler: MessageHandler<T>) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, []);
        }
        this.handlers.get(type)!.push(handler as MessageHandler);
    }

    public unsubscribe<T extends MESSAGE_TYPES>(type: T, handler: MessageHandler<T>) {
        const handler_list = this.handlers.get(type);
        if (!handler_list) return;

        const index = handler_list.indexOf(handler as MessageHandler);
        if (index !== -1) handler_list.splice(index, 1);
        if (handler_list.length === 0) this.handlers.delete(type);
    }

    public send_message<T extends MESSAGE_TYPES>(message: MessagePayload<T>) {
        if (this.is_connected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            this.message_queue.push(message as AnyMessagePayload);
        }
    }

    /** Subscribe to real-time updates for a specific market */
    public subscribe_market(marketId: string) {
        this.send_message<MESSAGE_TYPES.SUBSCRIBE_MARKET>({
            type: MESSAGE_TYPES.SUBSCRIBE_MARKET,
            payload: { tokenId: marketId },
        });
    }

    /** Unsubscribe from real-time updates for a specific market */
    public unsubscribe_market(marketId: string) {
        this.send_message<MESSAGE_TYPES.UNSUBSCRIBE_MARKET>({
            type: MESSAGE_TYPES.UNSUBSCRIBE_MARKET,
            payload: { tokenId: marketId },
        });
    }

    private attempt_reconnect() {
        if (this.is_manually_closed) return;

        this.reconnect_attempts++;

        let delay: number;

        if (this.reconnect_attempts <= this.max_reconnect_attempts) {
            delay = this.reconnect_delay;
            this.reconnect_delay = Math.min(this.reconnect_delay * 2, this.max_reconnect_delay);
        } else {
            console.warn(
                `Max reconnection attempts (${this.max_reconnect_attempts}) reached. Switching to persistent reconnection mode.`,
            );
            delay = this.persistent_reconnect_delay;
            this.reconnect_delay = 1000;
        }

        this.reconnect_timeout = setTimeout(() => {
            if (!this.is_manually_closed) this.initialize_connection();
        }, delay);
    }

    private flush_message_queue() {
        while (this.message_queue.length > 0) {
            const message = this.message_queue.shift();
            if (message) this.send_message(message as MessagePayload<MESSAGE_TYPES>);
        }
    }

    public close(code: number = 1000, reason: string = 'Client disconnect') {
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
