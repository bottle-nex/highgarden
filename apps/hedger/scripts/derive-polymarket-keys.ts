/**
 * One-time bootstrap: derive Polymarket API key/secret/passphrase from a
 * Polygon wallet's signature.
 *
 * Run once after setting HEDGER_POLYMARKET_PRIVATE_KEY (and optionally
 * HEDGER_POLYMARKET_FUNDER_ADDRESS) in apps/hedger/.env. Output is printed
 * to YOUR terminal — copy the three values into .env, never share.
 *
 *   bun scripts/derive-polymarket-keys.ts
 *
 * The same wallet always derives the same creds (it's deterministic), so
 * if you ever lose them you can re-run this against the same private key.
 */
import { ClobClient, Chain } from "@polymarket/clob-client-v2";
import { Wallet, providers } from "ethers";
import EnvService, { ENV } from "../config/env";

class PolymarketKeyDeriver {
  public async run(): Promise<void> {
    EnvService.parse_env();
    this.assert_prerequisites();
    const client = this.build_unauthed_client();
    const creds = await client.createOrDeriveApiKey();
    this.print_credentials(creds);
  }

  private assert_prerequisites(): void {
    if (!ENV.HEDGER_POLYMARKET_PRIVATE_KEY) {
      console.error(
        "[derive-keys] HEDGER_POLYMARKET_PRIVATE_KEY is not set in .env. Add the Polygon wallet's private key first.",
      );
      process.exit(1);
    }
  }

  private build_unauthed_client(): ClobClient {
    const provider = ENV.HEDGER_POLYGON_RPC_URL
      ? new providers.JsonRpcProvider(ENV.HEDGER_POLYGON_RPC_URL)
      : undefined;
    const wallet = new Wallet(ENV.HEDGER_POLYMARKET_PRIVATE_KEY!, provider);
    return new ClobClient({
      host: ENV.HEDGER_POLYMARKET_REST_URL,
      chain: Chain.POLYGON,
      signer: wallet,
      funderAddress: ENV.HEDGER_POLYMARKET_FUNDER_ADDRESS,
    });
  }

  private print_credentials(creds: { key: string; secret: string; passphrase: string }): void {
    console.log("");
    console.log("════════════════════════════════════════════════════════════");
    console.log(" POLYMARKET API CREDENTIALS — paste into apps/hedger/.env");
    console.log("════════════════════════════════════════════════════════════");
    console.log("");
    console.log(`HEDGER_POLYMARKET_API_KEY=${creds.key}`);
    console.log(`HEDGER_POLYMARKET_API_SECRET=${creds.secret}`);
    console.log(`HEDGER_POLYMARKET_API_PASSPHRASE=${creds.passphrase}`);
    console.log("");
    console.log("⚠️  these are like passwords. never paste them anywhere public.");
    console.log("    same wallet → same creds, so you can re-derive if lost.");
    console.log("════════════════════════════════════════════════════════════");
  }
}

await new PolymarketKeyDeriver().run();
process.exit(0);
