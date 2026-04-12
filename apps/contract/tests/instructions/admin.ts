import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { expect } from "chai";

import { TestContext, sha256, deriveMarketPda, MARKET_SEED } from "../utils/setup";

export function adminTests(getCtx: () => TestContext): void {
  describe("admin_pause / admin_unpause", () => {
    let marketPda: anchor.web3.PublicKey;

    before(async () => {
      const ctx = getCtx();

      const id = "0xadmintest".padEnd(66, "0");
      const idHash = sha256(id);
      const questionHash = sha256("Admin test market");
      const endTime = new anchor.BN(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30);

      [marketPda] = deriveMarketPda(ctx.program.programId, idHash);

      await ctx.program.methods
        .createMarket(
          Array.from(idHash) as number[],
          id,
          Array.from(questionHash) as number[],
          endTime,
          100,
          "yes-admin",
          "no-admin",
        )
        .accountsStrict({
          admin: ctx.admin.publicKey,
          config: ctx.configPda,
          market: marketPda,
          systemProgram: ctx.systemProgram,
        })
        .signers([ctx.admin])
        .rpc();
    });

    it("admin pauses the market", async () => {
      const ctx = getCtx();

      await ctx.program.methods
        .adminPauseMarket()
        .accountsStrict({
          config: ctx.configPda,
          admin: ctx.admin.publicKey,
          market: marketPda,
        })
        .signers([ctx.admin])
        .rpc();

      const market = await ctx.program.account.market.fetch(marketPda);
      expect(market.paused).to.equal(true);
    });

    it("admin unpauses the market", async () => {
      const ctx = getCtx();

      await ctx.program.methods
        .adminUnpauseMarket()
        .accountsStrict({
          config: ctx.configPda,
          admin: ctx.admin.publicKey,
          market: marketPda,
        })
        .signers([ctx.admin])
        .rpc();

      const market = await ctx.program.account.market.fetch(marketPda);
      expect(market.paused).to.equal(false);
    });

    it("rejects pause from a non-admin", async () => {
      const ctx = getCtx();

      const impostor = Keypair.generate();
      const airdropSig = await ctx.provider.connection.requestAirdrop(
        impostor.publicKey,
        anchor.web3.LAMPORTS_PER_SOL,
      );
      await ctx.provider.connection.confirmTransaction(airdropSig);

      let failed = false;
      try {
        await ctx.program.methods
          .adminPauseMarket()
          .accountsStrict({
            config: ctx.configPda,
            admin: impostor.publicKey,
            market: marketPda,
          })
          .signers([impostor])
          .rpc();
      } catch (err: any) {
        failed = true;
        const code = err?.error?.errorCode?.code ?? err?.toString?.() ?? "";
        expect(code).to.contain("Unauthorized");
      }

      expect(failed, "expected non-admin to be rejected").to.equal(true);
    });

    it("rejects unpause from a non-admin", async () => {
      const ctx = getCtx();

      // pause first so unpause is meaningful
      await ctx.program.methods
        .adminPauseMarket()
        .accountsStrict({
          config: ctx.configPda,
          admin: ctx.admin.publicKey,
          market: marketPda,
        })
        .signers([ctx.admin])
        .rpc();

      const impostor = Keypair.generate();
      const airdropSig = await ctx.provider.connection.requestAirdrop(
        impostor.publicKey,
        anchor.web3.LAMPORTS_PER_SOL,
      );
      await ctx.provider.connection.confirmTransaction(airdropSig);

      let failed = false;
      try {
        await ctx.program.methods
          .adminUnpauseMarket()
          .accountsStrict({
            config: ctx.configPda,
            admin: impostor.publicKey,
            market: marketPda,
          })
          .signers([impostor])
          .rpc();
      } catch (err: any) {
        failed = true;
        const code = err?.error?.errorCode?.code ?? err?.toString?.() ?? "";
        expect(code).to.contain("Unauthorized");
      }

      expect(failed, "expected non-admin to be rejected").to.equal(true);
    });
  });
}
