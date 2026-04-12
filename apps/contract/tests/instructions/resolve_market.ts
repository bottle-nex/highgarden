import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { expect } from "chai";

import { getTestMarketPda, sha256, MARKET_SEED, TestContext } from "../utils/setup";

export function resolveMarketTests(getCtx: () => TestContext): void {
  describe("resolve_market", () => {
    let marketPda: anchor.web3.PublicKey;

    before(() => {
      const ctx = getCtx();
      [marketPda] = getTestMarketPda(ctx.program.programId);
    });

    it("oracle signer resolves the market with YES", async () => {
      const ctx = getCtx();

      await ctx.program.methods
        .resolveMarket(0)
        .accountsStrict({
          config: ctx.configPda,
          oracleSigner: ctx.oracleSigner.publicKey,
          market: marketPda,
        })
        .signers([ctx.oracleSigner])
        .rpc();

      const market = await ctx.program.account.market.fetch(marketPda);
      expect(market.status).to.have.property("resolved");
      expect(market.winningOutcome).to.equal(0);
    });

    it("rejects a non-oracle signer", async () => {
      const ctx = getCtx();

      const fakeId = "0xresolvereject".padEnd(66, "0");
      const fakeIdHash = sha256(fakeId);
      const [freshMarket] = anchor.web3.PublicKey.findProgramAddressSync(
        [MARKET_SEED, fakeIdHash],
        ctx.program.programId,
      );

      const impostor = Keypair.generate();
      let failed = false;
      try {
        await ctx.program.methods
          .resolveMarket(0)
          .accountsStrict({
            config: ctx.configPda,
            oracleSigner: impostor.publicKey,
            market: freshMarket,
          })
          .signers([impostor])
          .rpc();
      } catch (err: any) {
        failed = true;
        const code = err?.error?.errorCode?.code ?? err?.toString?.() ?? "";
        expect(code).to.contain("Unauthorized");
      }

      expect(failed, "expected non-oracle signer to fail").to.equal(true);
    });

    it("rejects resolving an already-resolved market", async () => {
      const ctx = getCtx();

      let failed = false;
      try {
        await ctx.program.methods
          .resolveMarket(1)
          .accountsStrict({
            config: ctx.configPda,
            oracleSigner: ctx.oracleSigner.publicKey,
            market: marketPda,
          })
          .signers([ctx.oracleSigner])
          .rpc();
      } catch (err: any) {
        failed = true;
        const code = err?.error?.errorCode?.code ?? err?.toString?.() ?? "";
        expect(code).to.contain("MarketClosed");
      }

      expect(failed, "expected already-resolved market to fail").to.equal(true);
    });
  });
}
