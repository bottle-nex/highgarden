import { ENV } from "../config/config.env";
import type { PolymarketAuth } from "../types/polymarket/types.polymarket";

export function has_polymarket_creds(): boolean {
    return Boolean(
        ENV.SERVER_POLYMARKET_API_KEY &&
        ENV.SERVER_POLYMARKET_SECRET &&
        ENV.SERVER_POLYMARKET_PASSPHRASE,
    );
}

export function build_polymarket_auth(): PolymarketAuth {
    if (!has_polymarket_creds()) {
        throw new Error("polymarket creds missing — cannot build auth");
    }
    return {
        apiKey: ENV.SERVER_POLYMARKET_API_KEY,
        secret: ENV.SERVER_POLYMARKET_SECRET,
        passphrase: ENV.SERVER_POLYMARKET_PASSPHRASE,
    };
}
