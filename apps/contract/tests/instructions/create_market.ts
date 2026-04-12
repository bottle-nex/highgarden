import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

import {
  deriveMarketPda,
  sha256,
  TestContext,
  TEST_POLYMARKET_ID,
  TEST_YES_TOKEN_ID,
  TEST_NO_TOKEN_ID,
  TEST_TICK_SIZE,
} from "../utils/setup";

export function createMarketTests(getCtx: () => TestContext): void {
  describe("create_market", () => {
    it("creates a new market PDA", async () => {
      const ctx = getCtx();

      const polymarketMarketIdHash = sha256(TEST_POLYMARKET_ID);
      const questionHash = sha256("Will BTC hit 150k by EOY?");
      const endTime = new anchor.BN(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30);

      const [marketPda] = deriveMarketPda(ctx.program.programId, polymarketMarketIdHash);

      await ctx.program.methods
        .createMarket(
          Array.from(polymarketMarketIdHash) as number[],
          TEST_POLYMARKET_ID,
          Array.from(questionHash) as number[],
          endTime,
          TEST_TICK_SIZE,
          TEST_YES_TOKEN_ID,
          TEST_NO_TOKEN_ID,
        )
        .accountsStrict({
          admin: ctx.admin.publicKey,
          config: ctx.configPda,
          market: marketPda,
          systemProgram: ctx.systemProgram,
        })
        .signers([ctx.admin])
        .rpc();

      const market = await ctx.program.account.market.fetch(marketPda);

      expect(market.polymarketMarketId).to.equal(TEST_POLYMARKET_ID);
      expect(Buffer.from(market.polymarketMarketIdHash).equals(polymarketMarketIdHash)).to.equal(
        true,
      );
      expect(Buffer.from(market.questionHash).equals(questionHash)).to.equal(true);
      expect(market.endTime.toString()).to.equal(endTime.toString());
      expect(market.tickSize).to.equal(TEST_TICK_SIZE);
      expect(market.yesTokenId).to.equal(TEST_YES_TOKEN_ID);
      expect(market.noTokenId).to.equal(TEST_NO_TOKEN_ID);
      expect(market.totalYes.toNumber()).to.equal(0);
      expect(market.totalNo.toNumber()).to.equal(0);
      expect(market.paused).to.equal(false);
      expect(market.winningOutcome).to.equal(null);
      expect(market.status).to.have.property("open");
    });

    it("rejects a polymarket id whose hash does not match", async () => {
      const ctx = getCtx();

      const realId = "0xdeadbeef".padEnd(64, "0");
      const wrongHash = sha256("not-the-real-id");
      const questionHash = sha256("Some other question?");
      const endTime = new anchor.BN(Math.floor(Date.now() / 1000) + 60 * 60 * 24);

      const [marketPda] = deriveMarketPda(ctx.program.programId, wrongHash);

      let failed = false;
      try {
        await ctx.program.methods
          .createMarket(
            Array.from(wrongHash) as number[],
            realId,
            Array.from(questionHash) as number[],
            endTime,
            TEST_TICK_SIZE,
            TEST_YES_TOKEN_ID,
            TEST_NO_TOKEN_ID,
          )
          .accountsStrict({
            admin: ctx.admin.publicKey,
            config: ctx.configPda,
            market: marketPda,
            systemProgram: ctx.systemProgram,
          })
          .signers([ctx.admin])
          .rpc();
      } catch (err: any) {
        failed = true;
        const msg = (err?.error?.errorCode?.code as string | undefined) ?? err?.toString?.() ?? "";
        expect(msg).to.contain("InvalidMarketId");
      }

      expect(failed, "expected mismatched hash to fail").to.equal(true);
    });

    it("rejects an end time that is in the past", async () => {
      const ctx = getCtx();

      const id = "0xpastmarket".padEnd(66, "0");
      const idHash = sha256(id);
      const questionHash = sha256("Past market question");
      const endTime = new anchor.BN(Math.floor(Date.now() / 1000) - 60);

      const [marketPda] = deriveMarketPda(ctx.program.programId, idHash);

      let failed = false;
      try {
        await ctx.program.methods
          .createMarket(
            Array.from(idHash) as number[],
            id,
            Array.from(questionHash) as number[],
            endTime,
            TEST_TICK_SIZE,
            TEST_YES_TOKEN_ID,
            TEST_NO_TOKEN_ID,
          )
          .accountsStrict({
            admin: ctx.admin.publicKey,
            config: ctx.configPda,
            market: marketPda,
            systemProgram: ctx.systemProgram,
          })
          .signers([ctx.admin])
          .rpc();
      } catch (err: any) {
        failed = true;
        const msg = (err?.error?.errorCode?.code as string | undefined) ?? err?.toString?.() ?? "";
        expect(msg).to.contain("MarketEnded");
      }

      expect(failed, "expected past end_time to fail").to.equal(true);
    });
  });
}
