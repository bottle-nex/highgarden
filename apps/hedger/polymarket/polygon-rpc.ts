import { Wallet, providers } from "ethers";
import { ENV } from "../config/env";

export default class PolygonRpcFactory {
    private static provider: providers.JsonRpcProvider | null = null;
    private static signer: Wallet | null = null;

    public static is_configured(): boolean {
        return !!ENV.HEDGER_POLYGON_RPC_URL && !!ENV.HEDGER_POLYMARKET_PRIVATE_KEY;
    }

    public static get_provider(): providers.JsonRpcProvider {
        if (!this.provider) {
            if (!ENV.HEDGER_POLYGON_RPC_URL) {
                throw new Error("HEDGER_POLYGON_RPC_URL is not set");
            }
            this.provider = new providers.JsonRpcProvider(ENV.HEDGER_POLYGON_RPC_URL);
        }
        return this.provider;
    }

    public static get_signer(): Wallet {
        if (!this.signer) {
            if (!ENV.HEDGER_POLYMARKET_PRIVATE_KEY) {
                throw new Error("HEDGER_POLYMARKET_PRIVATE_KEY is not set");
            }
            this.signer = new Wallet(ENV.HEDGER_POLYMARKET_PRIVATE_KEY, this.get_provider());
        }
        return this.signer;
    }
}
