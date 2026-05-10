import { PolymarketClient } from "@solmarket/polymarket-client";
import { ENV } from "../config/config.env";

/**
 * Server's Polymarket facade. Singleton thin wrapper around
 * {@link PolymarketClient} from `@solmarket/polymarket-client` that reads
 * the server's `SERVER_POLYMARKET_*` env namespace.
 *
 * The trade orchestrator uses this to place hedge orders synchronously
 * before committing on Solana. Behaviour is identical to apps/hedger's
 * client (same shared package), differing only in which env vars are
 * consumed and which logger is bound.
 */
export default class ServerPolymarketClientFactory {
    private static cached: PolymarketClient | null = null;

    public static get(): PolymarketClient {
        if (this.cached) return this.cached;
        this.cached = new PolymarketClient({
            restUrl: ENV.SERVER_POLYMARKET_REST_URL,
            gammaUrl: ENV.SERVER_POLYMARKET_GAMMA_URL,
            privateKey: ENV.SERVER_POLYMARKET_PRIVATE_KEY,
            funderAddress: ENV.SERVER_POLYMARKET_FUNDER_ADDRESS,
            apiKey: ENV.SERVER_POLYMARKET_API_KEY,
            apiSecret: ENV.SERVER_POLYMARKET_API_SECRET,
            apiPassphrase: ENV.SERVER_POLYMARKET_API_PASSPHRASE,
            polygonRpcUrl: ENV.SERVER_POLYGON_RPC_URL,
            // The server uses console for logs today; pass an adapter that
            // matches LoggerLike. Replace with pino when the server adopts it.
            logger: build_console_logger(),
        });
        return this.cached;
    }
}

function build_console_logger() {
    return {
        debug: (obj: unknown, msg?: string) => console.debug(msg ?? "[polymarket]", obj),
        info: (obj: unknown, msg?: string) => console.info(msg ?? "[polymarket]", obj),
        warn: (obj: unknown, msg?: string) => console.warn(msg ?? "[polymarket]", obj),
        error: (obj: unknown, msg?: string) => console.error(msg ?? "[polymarket]", obj),
    };
}
