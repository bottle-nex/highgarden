import { PolymarketClient as SharedPolymarketClient } from "@solmarket/polymarket-client";
import { ENV } from "../envs/env";
import { logger_for } from "../log/log";

/**
 * Hedger's Polymarket facade. Thin subclass of {@link SharedPolymarketClient}
 * from `@solmarket/polymarket-client` that knows how to read the hedger's
 * `HEDGER_POLYMARKET_*` env namespace and bind the pino logger.
 *
 * Behaviour, types, and method names are identical to the shared client —
 * this exists purely so the call sites in the hedger can keep using a
 * no-arg constructor (`new PolymarketClient()`) without each one having to
 * read env. The actual implementation lives in the shared package so
 * apps/server can instantiate its own copy with `SERVER_POLYMARKET_*`
 * envs without code duplication.
 */
export default class PolymarketClient extends SharedPolymarketClient {
    constructor() {
        super({
            restUrl: ENV.HEDGER_POLYMARKET_REST_URL,
            gammaUrl: ENV.HEDGER_POLYMARKET_GAMMA_URL,
            privateKey: ENV.HEDGER_POLYMARKET_PRIVATE_KEY,
            funderAddress: ENV.HEDGER_POLYMARKET_FUNDER_ADDRESS,
            apiKey: ENV.HEDGER_POLYMARKET_API_KEY,
            apiSecret: ENV.HEDGER_POLYMARKET_API_SECRET,
            apiPassphrase: ENV.HEDGER_POLYMARKET_API_PASSPHRASE,
            polygonRpcUrl: ENV.HEDGER_POLYGON_RPC_URL,
            logger: logger_for("polymarket"),
        });
    }
}

/** Re-export the public types so existing hedger imports
 *  (`import type { BookTop, GammaResolution, ... } from '../clients/polymarket'`)
 *  keep working. */
export type {
    BookTop,
    GammaResolution,
    OrderSide,
    PlaceMarketOrderInput,
    PlaceMarketOrderResult,
    RedeemOutcome,
} from "@solmarket/polymarket-client";
