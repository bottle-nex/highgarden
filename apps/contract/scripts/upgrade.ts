import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const PROGRAM_ID = "2LEm66V2Ys8JbVoQfYbZqCy6YGM1wuPUc843xRx76t3P";
const CLUSTER = "devnet";

class ContractUpgrader {
  private readonly contract_dir = resolve(import.meta.dir, "..");
  private readonly so_path = join(this.contract_dir, "target/deploy/contract.so");
  private readonly wallet_path = join(homedir(), ".config/solana/id.json");

  public async run(): Promise<void> {
    this.banner("PRE-FLIGHT");
    await this.preflight();

    this.banner("BUILD (release, no-idl)");
    await this.build();

    this.banner("SYNC IDL → TS PACKAGE");
    await this.sync_idl();

    this.banner("UPGRADE ON-CHAIN");
    await this.upgrade();

    this.banner("VERIFY");
    await this.verify();

    console.log("\nupgrade complete.");
  }

  private banner(text: string): void {
    console.log("");
    console.log("=".repeat(60));
    console.log(`  ${text}`);
    console.log("=".repeat(60));
  }

  private async preflight(): Promise<void> {
    if (!existsSync(this.wallet_path)) {
      throw new Error(`upgrade authority wallet not found: ${this.wallet_path}`);
    }
    const wallet_pubkey = await this.local_wallet_pubkey();
    console.log(`local wallet:        ${wallet_pubkey}`);
    await this.assert_authority_matches(wallet_pubkey);
    await this.print_balance(wallet_pubkey);
  }

  private async local_wallet_pubkey(): Promise<string> {
    const out = await Bun.$`solana-keygen pubkey ${this.wallet_path}`.text();
    return out.trim();
  }

  private async assert_authority_matches(wallet_pubkey: string): Promise<void> {
    const info = await Bun.$`solana program show ${PROGRAM_ID} --url ${CLUSTER}`.text();
    const match = info.match(/Authority:\s+(\S+)/);
    if (!match) {
      throw new Error("could not parse `Authority:` from `solana program show` output");
    }
    const onchain = match[1];
    console.log(`on-chain authority:  ${onchain}`);
    if (onchain !== wallet_pubkey) {
      throw new Error(
        `authority mismatch — local wallet ${wallet_pubkey} cannot upgrade ${PROGRAM_ID} (on-chain authority is ${onchain})`,
      );
    }
  }

  private async print_balance(wallet_pubkey: string): Promise<void> {
    const balance = (
      await Bun.$`solana balance ${wallet_pubkey} --url ${CLUSTER}`.text()
    ).trim();
    console.log(`wallet balance:      ${balance}`);
  }

  private async build(): Promise<void> {
    await Bun.$`cargo clean`.cwd(this.contract_dir);
    await Bun.$`anchor build -- --features no-idl`.cwd(this.contract_dir);

    if (!existsSync(this.so_path)) {
      throw new Error(`build artifact missing: ${this.so_path}`);
    }
    const size_kb = Math.round(statSync(this.so_path).size / 1024);
    console.log(`\ncontract.so size: ${size_kb} KB`);
  }

  private async sync_idl(): Promise<void> {
    await Bun.$`bun sync`.cwd(this.contract_dir);
  }

  private async upgrade(): Promise<void> {
    await Bun.$`anchor upgrade ${this.so_path} --program-id ${PROGRAM_ID} --provider.cluster ${CLUSTER} --provider.wallet ${this.wallet_path}`.cwd(
      this.contract_dir,
    );
  }

  private async verify(): Promise<void> {
    const out = await Bun.$`solana program show ${PROGRAM_ID} --url ${CLUSTER}`.text();
    console.log(out);
  }
}

const upgrader = new ContractUpgrader();
await upgrader.run();
