import { ClobClient, Chain, type ApiKeyCreds } from "@polymarket/clob-client";
import { Wallet, providers } from "ethers";
import { ENV } from "../config/env";
import LoggerFactory from "../log/logger";

export default class PolymarketClientFactory {
  private static client: ClobClient | null = null;
  private static dry_run: boolean | null = null;

  private static log() {
    return LoggerFactory.for_category("polymarket");
  }

  public static is_dry_run(): boolean {
    if (this.dry_run !== null) return this.dry_run;
    const creds_present =
      !!ENV.HEDGER_POLYMARKET_PRIVATE_KEY &&
      !!ENV.HEDGER_POLYMARKET_FUNDER_ADDRESS &&
      !!ENV.HEDGER_POLYMARKET_API_KEY &&
      !!ENV.HEDGER_POLYMARKET_API_SECRET &&
      !!ENV.HEDGER_POLYMARKET_API_PASSPHRASE;
    this.dry_run = !creds_present;
    if (this.dry_run) {
      this.log().warn(
        "polymarket credentials missing — running in DRY-RUN mode. Hedge orders will be logged but NOT placed.",
      );
    }
    return this.dry_run;
  }

  public static get_client(): ClobClient {
    if (this.is_dry_run()) {
      throw new Error("PolymarketClientFactory.get_client() called in dry-run mode");
    }
    if (!this.client) {
      this.client = this.build_client();
    }
    return this.client;
  }

  private static build_client(): ClobClient {
    const wallet = this.build_signer();
    const creds = this.build_creds();
    return new ClobClient(
      ENV.HEDGER_POLYMARKET_REST_URL,
      Chain.POLYGON,
      wallet,
      creds,
      undefined,
      ENV.HEDGER_POLYMARKET_FUNDER_ADDRESS,
    );
  }

  private static build_signer(): Wallet {
    const provider = ENV.HEDGER_POLYGON_RPC_URL
      ? new providers.JsonRpcProvider(ENV.HEDGER_POLYGON_RPC_URL)
      : undefined;
    return new Wallet(ENV.HEDGER_POLYMARKET_PRIVATE_KEY!, provider);
  }

  private static build_creds(): ApiKeyCreds {
    return {
      key: ENV.HEDGER_POLYMARKET_API_KEY!,
      secret: ENV.HEDGER_POLYMARKET_API_SECRET!,
      passphrase: ENV.HEDGER_POLYMARKET_API_PASSPHRASE!,
    };
  }
}
