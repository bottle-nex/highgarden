import { expect } from "chai";

import { TestContext } from "../utils/setup";

export function initializeConfigTests(getCtx: () => TestContext): void {
  describe("initialize_config", () => {
    it("initializes the config PDA and creates the treasury vault", async () => {
      const ctx = getCtx();

      await ctx.program.methods
        .initializeConfig(ctx.oracleSigner.publicKey, ctx.quoteSigner.publicKey)
        .accountsStrict({
          admin: ctx.admin.publicKey,
          config: ctx.configPda,
          treasuryAuthority: ctx.treasuryAuthorityPda,
          treasuryVault: ctx.treasuryVaultPda,
          usdcMint: ctx.usdcMint,
          tokenProgram: ctx.tokenProgram,
          systemProgram: ctx.systemProgram,
          rent: ctx.rent,
        })
        .signers([ctx.admin])
        .rpc();

      const config = await ctx.program.account.config.fetch(ctx.configPda);

      expect(config.admin.toBase58()).to.equal(ctx.admin.publicKey.toBase58());
      expect(config.oracleSigner.toBase58()).to.equal(ctx.oracleSigner.publicKey.toBase58());
      expect(config.quoteSigner.toBase58()).to.equal(ctx.quoteSigner.publicKey.toBase58());
      expect(config.treasuryVault.toBase58()).to.equal(ctx.treasuryVaultPda.toBase58());
      expect(config.usdcMint.toBase58()).to.equal(ctx.usdcMint.toBase58());
      expect(config.bump).to.be.a("number");
      expect(config.treasuryAuthorityBump).to.be.a("number");
      expect(config.treasuryVaultBump).to.be.a("number");
    });

    it("rejects a second initialization attempt", async () => {
      const ctx = getCtx();

      let failed = false;
      try {
        await ctx.program.methods
          .initializeConfig(ctx.oracleSigner.publicKey, ctx.quoteSigner.publicKey)
          .accountsStrict({
            admin: ctx.admin.publicKey,
            config: ctx.configPda,
            treasuryAuthority: ctx.treasuryAuthorityPda,
            treasuryVault: ctx.treasuryVaultPda,
            usdcMint: ctx.usdcMint,
            tokenProgram: ctx.tokenProgram,
            systemProgram: ctx.systemProgram,
            rent: ctx.rent,
          })
          .signers([ctx.admin])
          .rpc();
      } catch (err) {
        failed = true;
      }

      expect(failed, "expected re-initialization to fail").to.equal(true);
    });
  });
}
