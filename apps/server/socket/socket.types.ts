import type { MarketEvent } from "@solmarket/polymarket-contracts";

export type ClientMessage =
    | { type: "subscribe"; token_id: string }
    | { type: "unsubscribe"; token_id: string }
    | { type: "ping" };

export type ServerMessage =
    | { type: "market"; event: MarketEvent }
    | { type: "error"; message: string }
    | { type: "subscribed"; token_id: string }
    | { type: "unsubscribed"; token_id: string }
    | { type: "pong" };
