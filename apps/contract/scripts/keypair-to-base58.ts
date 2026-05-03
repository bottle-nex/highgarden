import bs58 from "bs58";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

class KeypairConverter {
  public run(arg_path: string | undefined): void {
    if (!arg_path) {
      console.error("usage: bun scripts/keypair-to-base58.ts <path-to-keypair.json>");
      process.exit(1);
    }
    const absolute = resolve(arg_path);
    const bytes = this.load_secret_bytes(absolute);
    const encoded = bs58.encode(bytes);
    this.print(absolute, encoded);
  }

  private load_secret_bytes(absolute_path: string): Uint8Array {
    const raw = readFileSync(absolute_path, "utf8").trim();
    try {
      const arr = JSON.parse(raw) as number[];
      if (!Array.isArray(arr) || arr.length !== 64) {
        throw new Error(`expected 64-element array, got ${arr.length}`);
      }
      return Uint8Array.from(arr);
    } catch (err) {
      throw new Error(`failed to parse keypair at ${absolute_path}: ${err}`);
    }
  }

  private print(path: string, encoded: string): void {
    console.log("");
    console.log(`# base58 secret for ${path}`);
    console.log(encoded);
    console.log("");
    console.log("paste this into your local .env only, never share it");
  }
}

new KeypairConverter().run(process.argv[2]);
