export enum SIDE {
  BUY = "BUY",
  SELL = "SELL",
}

export type MarketEvent =
  | {
      event_type: "book";
      asset_id: string;
      market: string;
      bids: Array<{ price: string; size: string }>;
      asks: Array<{ price: string; size: string }>;
      timestamp: string;
      hash: string;
    }
  | {
      event_type: "price_change";
      asset_id: string;
      market: string;
      changes: Array<{ price: string; size: string; side: SIDE }>;
      timestamp: string;
    }
  | {
      event_type: "tick_size_change";
      asset_id: string;
      market: string;
      old_tick_size: string;
      new_tick_size: string;
      timestamp: string;
    };

export type UserEvent =
  | { event_type: "trade"; [k: string]: unknown }
  | { event_type: "order"; [k: string]: unknown };

export type ControlMessage =
  | { action: "subscribe"; token_id: string; consumer_id?: string }
  | { action: "unsubscribe"; token_id: string; consumer_id?: string };

export type SocketState = "idle" | "connecting" | "open" | "closing" | "closed" | "reconnecting";
