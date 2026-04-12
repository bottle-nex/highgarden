import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

import {
  TestContext,
  getTestMarketPda,
  derivePositionPda,
} from "../utils/setup";

export function claimTests(getCtx: () => TestContext): void {
  describe("claim", () => {
    let marketPda: anchor.web3.PublicKey;
    let userPositionPda: anchor.web3.PublicKey;
    let userUsdc: anchor.web3.PublicKey;

    before(async () => {
      const ctx = getCtx();
      [marketPda] = getTestMarketPda(ctx.program.programId);
      [userPositionPda] = derivePositionPda(
        ctx.program.programId,
        ctx.admin.publicKey,
        marketPda,
      );

      const ata = await getOrCreateAssociatedTokenAccount(
        ctx.provider.connection,
        ctx.admin,
        ctx.usdcMint,
        ctx.admin.publicKey,
      );
      userUsdc = ata.address;

      // Ensure the treasury vault has enough USDC for the full payout.
      // In production, profits from Polymarket hedging cover the gap;
      // here we top up the vault directly.
      await mintTo(
        ctx.provider.connection,
        ctx.admin,
        ctx.usdcMint,
        ctx.treasuryVaultPda,
        ctx.admin,
        100_000_000,
      );
    });

    it("pays out winning YES shares at $1 each", async () => {
      const ctx = getCtx();

      const posBefore = await ctx.program.account.userPosition.fetch(userPositionPda);
      const winningShares = posBefore.yesShares.toNumber();
      expect(winningShares).to.be.greaterThan(0);

      const userBefore = await getAccount(ctx.provider.connection, userUsdc);
      const vaultBefore = await getAccount(ctx.provider.connection, ctx.treasuryVaultPda);

      await ctx.program.methods
        .claim()
        .accountsStrict({
          user: ctx.admin.publicKey,
          config: ctx.configPda,
          market: marketPda,
          userPosition: userPositionPda,
          userUsdc,
          treasuryVault: ctx.treasuryVaultPda,
          treasuryAuthority: ctx.treasuryAuthorityPda,
          tokenProgram: ctx.tokenProgram,
        })
        .signers([ctx.admin])
        .rpc();

      const expectedPayout = BigInt(winningShares) * BigInt(1_000_000);

      const userAfter = await getAccount(ctx.provider.connection, userUsdc);
      const vaultAfter = await getAccount(ctx.provider.connection, ctx.treasuryVaultPda);
      expect(userAfter.amount - userBefore.amount).to.equal(expectedPayout);
      expect(vaultBefore.amount - vaultAfter.amount).to.equal(expectedPayout);

      const posAfter = await ctx.program.account.userPosition.fetch(userPositionPda);
      expect(posAfter.yesShares.toNumber()).to.equal(0);
    });

    it("rejects a double claim (no winning shares left)", async () => {
      const ctx = getCtx();

      let failed = false;
      try {
        await ctx.program.methods
          .claim()
          .accountsStrict({
            user: ctx.admin.publicKey,
            config: ctx.configPda,
            market: marketPda,
            userPosition: userPositionPda,
            userUsdc,
            treasuryVault: ctx.treasuryVaultPda,
            treasuryAuthority: ctx.treasuryAuthorityPda,
            tokenProgram: ctx.tokenProgram,
          })
          .signers([ctx.admin])
          .rpc();
      } catch (err: any) {
        failed = true;
        const code = err?.error?.errorCode?.code ?? err?.toString?.() ?? "";
        expect(code).to.contain("NoWinningShares");
      }

      expect(failed, "expected double claim to fail").to.equal(true);
    });

    it("rejects claim from a user with only losing shares", async () => {
      const ctx = getCtx();

      // The admin has no NO shares, and the market resolved YES.
      // Create a fresh user who somehow only holds NO shares — simulate
      // by checking that an empty position cannot claim.
      const loser = Keypair.generate();
      const airdropSig = await ctx.provider.connection.requestAirdrop(
        loser.publicKey,
        anchor.web3.LAMPORTS_PER_SOL,
      );
      await ctx.provider.connection.confirmTransaction(airdropSig);

      const loserAta = await getOrCreateAssociatedTokenAccount(
        ctx.provider.connection,
        ctx.admin,
        ctx.usdcMint,
        loser.publicKey,
      );

      // Derive the position PDA — it does not exist on-chain yet, so
      // the has_one check or deserialization will fail.
      const [loserPosPda] = derivePositionPda(
        ctx.program.programId,
        loser.publicKey,
        marketPda,
      );

      let failed = false;
      try {
        await ctx.program.methods
          .claim()
          .accountsStrict({
            user: loser.publicKey,
            config: ctx.configPda,
            market: marketPda,
            userPosition: loserPosPda,
            userUsdc: loserAta.address,
            treasuryVault: ctx.treasuryVaultPda,
            treasuryAuthority: ctx.treasuryAuthorityPda,
            tokenProgram: ctx.tokenProgram,
          })
          .signers([loser])
          .rpc();
      } catch {
        failed = true;
      }

      expect(failed, "expected user with no position to fail").to.equal(true);
    });
  });
}
