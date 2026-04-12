import * as anchor from "@coral-xyz/anchor";
import { Keypair, Ed25519Program } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo, getAccount } from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";

import {
  TestContext,
  sha256,
  deriveMarketPda,
  getTestMarketPda,
  derivePositionPda,
  deriveNoncePda,
  generateNonce,
  serializeSignedQuote,
  QuoteFields,
} from "../utils/setup";

export function placeOrderTests(getCtx: () => TestContext): void {
  describe("place_order", () => {
    let userUsdc: anchor.web3.PublicKey;
    let marketPda: anchor.web3.PublicKey;

    before(async () => {
      const ctx = getCtx();
      [marketPda] = getTestMarketPda(ctx.program.programId);

      const ata = await getOrCreateAssociatedTokenAccount(
        ctx.provider.connection,
        ctx.admin,
        ctx.usdcMint,
        ctx.admin.publicKey,
      );
      userUsdc = ata.address;

      await mintTo(
        ctx.provider.connection,
        ctx.admin,
        ctx.usdcMint,
        userUsdc,
        ctx.admin,
        100_000_000,
      );
    });

    function buildQuote(ctx: TestContext, overrides: Partial<QuoteFields> = {}): QuoteFields {
      return {
        market: marketPda,
        side: 0,
        outcome: 0,
        price: 50,
        size: new BN(10),
        expiresAt: new BN(Math.floor(Date.now() / 1000) + 60),
        nonce: generateNonce(),
        ...overrides,
      };
    }

    function buildEd25519Ix(signer: Keypair, message: Buffer) {
      return Ed25519Program.createInstructionWithPrivateKey({
        privateKey: signer.secretKey,
        message,
      });
    }

    it("BUY YES: transfers USDC and credits shares", async () => {
      const ctx = getCtx();

      const quote = buildQuote(ctx);
      const message = serializeSignedQuote(quote);
      const ed25519Ix = buildEd25519Ix(ctx.quoteSigner, message);

      const [userPositionPda] = derivePositionPda(
        ctx.program.programId,
        ctx.admin.publicKey,
        marketPda,
      );
      const [usedNoncePda] = deriveNoncePda(ctx.program.programId, quote.nonce);

      const vaultBefore = await getAccount(ctx.provider.connection, ctx.treasuryVaultPda);
      const userBefore = await getAccount(ctx.provider.connection, userUsdc);

      const quoteArg = {
        market: quote.market,
        side: quote.side,
        outcome: quote.outcome,
        price: quote.price,
        size: quote.size,
        expiresAt: quote.expiresAt,
        nonce: Array.from(quote.nonce),
      };

      await ctx.program.methods
        .placeOrder(quoteArg)
        .accountsStrict({
          user: ctx.admin.publicKey,
          config: ctx.configPda,
          market: marketPda,
          userPosition: userPositionPda,
          usedNonce: usedNoncePda,
          userUsdc,
          treasuryVault: ctx.treasuryVaultPda,
          treasuryAuthority: ctx.treasuryAuthorityPda,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: ctx.tokenProgram,
          systemProgram: ctx.systemProgram,
        })
        .preInstructions([ed25519Ix])
        .signers([ctx.admin])
        .rpc();

      // price=50 cents, size=10 → 50 * 10_000 * 10 = 5_000_000
      const expectedUsdc = BigInt(50 * 10_000 * 10);

      const vaultAfter = await getAccount(ctx.provider.connection, ctx.treasuryVaultPda);
      const userAfter = await getAccount(ctx.provider.connection, userUsdc);
      expect(vaultAfter.amount - vaultBefore.amount).to.equal(expectedUsdc);
      expect(userBefore.amount - userAfter.amount).to.equal(expectedUsdc);

      const position = await ctx.program.account.userPosition.fetch(userPositionPda);
      expect(position.yesShares.toNumber()).to.equal(10);
      expect(position.noShares.toNumber()).to.equal(0);
      expect(position.user.toBase58()).to.equal(ctx.admin.publicKey.toBase58());
      expect(position.market.toBase58()).to.equal(marketPda.toBase58());

      const market = await ctx.program.account.market.fetch(marketPda);
      expect(market.totalYes.toNumber()).to.equal(10);
    });

    it("rejects an expired quote", async () => {
      const ctx = getCtx();

      const quote = buildQuote(ctx, {
        expiresAt: new BN(Math.floor(Date.now() / 1000) - 60),
        nonce: generateNonce(),
      });
      const message = serializeSignedQuote(quote);
      const ed25519Ix = buildEd25519Ix(ctx.quoteSigner, message);

      const [userPositionPda] = derivePositionPda(
        ctx.program.programId,
        ctx.admin.publicKey,
        marketPda,
      );
      const [usedNoncePda] = deriveNoncePda(ctx.program.programId, quote.nonce);

      const quoteArg = {
        market: quote.market,
        side: quote.side,
        outcome: quote.outcome,
        price: quote.price,
        size: quote.size,
        expiresAt: quote.expiresAt,
        nonce: Array.from(quote.nonce),
      };

      let failed = false;
      try {
        await ctx.program.methods
          .placeOrder(quoteArg)
          .accountsStrict({
            user: ctx.admin.publicKey,
            config: ctx.configPda,
            market: marketPda,
            userPosition: userPositionPda,
            usedNonce: usedNoncePda,
            userUsdc,
            treasuryVault: ctx.treasuryVaultPda,
            treasuryAuthority: ctx.treasuryAuthorityPda,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            tokenProgram: ctx.tokenProgram,
            systemProgram: ctx.systemProgram,
          })
          .preInstructions([ed25519Ix])
          .signers([ctx.admin])
          .rpc();
      } catch (err: any) {
        failed = true;
        const code = err?.error?.errorCode?.code ?? err?.toString?.() ?? "";
        expect(code).to.contain("QuoteExpired");
      }

      expect(failed, "expected expired quote to fail").to.equal(true);
    });

    it("rejects a signature from the wrong signer", async () => {
      const ctx = getCtx();

      const wrongSigner = Keypair.generate();
      const quote = buildQuote(ctx, { nonce: generateNonce() });
      const message = serializeSignedQuote(quote);
      const ed25519Ix = buildEd25519Ix(wrongSigner, message);

      const [userPositionPda] = derivePositionPda(
        ctx.program.programId,
        ctx.admin.publicKey,
        marketPda,
      );
      const [usedNoncePda] = deriveNoncePda(ctx.program.programId, quote.nonce);

      const quoteArg = {
        market: quote.market,
        side: quote.side,
        outcome: quote.outcome,
        price: quote.price,
        size: quote.size,
        expiresAt: quote.expiresAt,
        nonce: Array.from(quote.nonce),
      };

      let failed = false;
      try {
        await ctx.program.methods
          .placeOrder(quoteArg)
          .accountsStrict({
            user: ctx.admin.publicKey,
            config: ctx.configPda,
            market: marketPda,
            userPosition: userPositionPda,
            usedNonce: usedNoncePda,
            userUsdc,
            treasuryVault: ctx.treasuryVaultPda,
            treasuryAuthority: ctx.treasuryAuthorityPda,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            tokenProgram: ctx.tokenProgram,
            systemProgram: ctx.systemProgram,
          })
          .preInstructions([ed25519Ix])
          .signers([ctx.admin])
          .rpc();
      } catch (err: any) {
        failed = true;
        const code = err?.error?.errorCode?.code ?? err?.toString?.() ?? "";
        expect(code).to.contain("InvalidSignature");
      }

      expect(failed, "expected wrong signer to fail").to.equal(true);
    });

    it("rejects a replayed nonce", async () => {
      const ctx = getCtx();

      const reusedNonce = generateNonce();

      const quote1 = buildQuote(ctx, { nonce: reusedNonce });
      const message1 = serializeSignedQuote(quote1);
      const ed25519Ix1 = buildEd25519Ix(ctx.quoteSigner, message1);

      const [userPositionPda] = derivePositionPda(
        ctx.program.programId,
        ctx.admin.publicKey,
        marketPda,
      );
      const [usedNoncePda] = deriveNoncePda(ctx.program.programId, reusedNonce);

      const quoteArg1 = {
        market: quote1.market,
        side: quote1.side,
        outcome: quote1.outcome,
        price: quote1.price,
        size: quote1.size,
        expiresAt: quote1.expiresAt,
        nonce: Array.from(quote1.nonce),
      };

      await ctx.program.methods
        .placeOrder(quoteArg1)
        .accountsStrict({
          user: ctx.admin.publicKey,
          config: ctx.configPda,
          market: marketPda,
          userPosition: userPositionPda,
          usedNonce: usedNoncePda,
          userUsdc,
          treasuryVault: ctx.treasuryVaultPda,
          treasuryAuthority: ctx.treasuryAuthorityPda,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: ctx.tokenProgram,
          systemProgram: ctx.systemProgram,
        })
        .preInstructions([ed25519Ix1])
        .signers([ctx.admin])
        .rpc();

      const quote2 = buildQuote(ctx, { nonce: reusedNonce });
      const message2 = serializeSignedQuote(quote2);
      const ed25519Ix2 = buildEd25519Ix(ctx.quoteSigner, message2);

      const quoteArg2 = {
        market: quote2.market,
        side: quote2.side,
        outcome: quote2.outcome,
        price: quote2.price,
        size: quote2.size,
        expiresAt: quote2.expiresAt,
        nonce: Array.from(quote2.nonce),
      };

      let failed = false;
      try {
        await ctx.program.methods
          .placeOrder(quoteArg2)
          .accountsStrict({
            user: ctx.admin.publicKey,
            config: ctx.configPda,
            market: marketPda,
            userPosition: userPositionPda,
            usedNonce: usedNoncePda,
            userUsdc,
            treasuryVault: ctx.treasuryVaultPda,
            treasuryAuthority: ctx.treasuryAuthorityPda,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            tokenProgram: ctx.tokenProgram,
            systemProgram: ctx.systemProgram,
          })
          .preInstructions([ed25519Ix2])
          .signers([ctx.admin])
          .rpc();
      } catch {
        failed = true;
      }

      expect(failed, "expected replayed nonce to fail").to.equal(true);
    });

    it("BUY NO: credits no_shares and updates market total", async () => {
      const ctx = getCtx();

      const quote = buildQuote(ctx, { outcome: 1, nonce: generateNonce() });
      const message = serializeSignedQuote(quote);
      const ed25519Ix = buildEd25519Ix(ctx.quoteSigner, message);

      const [userPositionPda] = derivePositionPda(
        ctx.program.programId,
        ctx.admin.publicKey,
        marketPda,
      );
      const [usedNoncePda] = deriveNoncePda(ctx.program.programId, quote.nonce);

      const posBefore = await ctx.program.account.userPosition.fetch(userPositionPda);

      const quoteArg = {
        market: quote.market,
        side: quote.side,
        outcome: quote.outcome,
        price: quote.price,
        size: quote.size,
        expiresAt: quote.expiresAt,
        nonce: Array.from(quote.nonce),
      };

      await ctx.program.methods
        .placeOrder(quoteArg)
        .accountsStrict({
          user: ctx.admin.publicKey,
          config: ctx.configPda,
          market: marketPda,
          userPosition: userPositionPda,
          usedNonce: usedNoncePda,
          userUsdc,
          treasuryVault: ctx.treasuryVaultPda,
          treasuryAuthority: ctx.treasuryAuthorityPda,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: ctx.tokenProgram,
          systemProgram: ctx.systemProgram,
        })
        .preInstructions([ed25519Ix])
        .signers([ctx.admin])
        .rpc();

      const posAfter = await ctx.program.account.userPosition.fetch(userPositionPda);
      expect(posAfter.noShares.toNumber()).to.equal(posBefore.noShares.toNumber() + 10);

      const market = await ctx.program.account.market.fetch(marketPda);
      expect(market.totalNo.toNumber()).to.equal(10);
    });

    it("SELL YES: returns USDC and decrements shares", async () => {
      const ctx = getCtx();

      const sellSize = new BN(5);
      const quote = buildQuote(ctx, {
        side: 1,
        outcome: 0,
        size: sellSize,
        nonce: generateNonce(),
      });
      const message = serializeSignedQuote(quote);
      const ed25519Ix = buildEd25519Ix(ctx.quoteSigner, message);

      const [userPositionPda] = derivePositionPda(
        ctx.program.programId,
        ctx.admin.publicKey,
        marketPda,
      );
      const [usedNoncePda] = deriveNoncePda(ctx.program.programId, quote.nonce);

      // Top up treasury so it can pay the seller
      await mintTo(
        ctx.provider.connection,
        ctx.admin,
        ctx.usdcMint,
        ctx.treasuryVaultPda,
        ctx.admin,
        50_000_000,
      );

      const posBefore = await ctx.program.account.userPosition.fetch(userPositionPda);
      const userBefore = await getAccount(ctx.provider.connection, userUsdc);
      const vaultBefore = await getAccount(ctx.provider.connection, ctx.treasuryVaultPda);

      const quoteArg = {
        market: quote.market,
        side: quote.side,
        outcome: quote.outcome,
        price: quote.price,
        size: quote.size,
        expiresAt: quote.expiresAt,
        nonce: Array.from(quote.nonce),
      };

      await ctx.program.methods
        .placeOrder(quoteArg)
        .accountsStrict({
          user: ctx.admin.publicKey,
          config: ctx.configPda,
          market: marketPda,
          userPosition: userPositionPda,
          usedNonce: usedNoncePda,
          userUsdc,
          treasuryVault: ctx.treasuryVaultPda,
          treasuryAuthority: ctx.treasuryAuthorityPda,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: ctx.tokenProgram,
          systemProgram: ctx.systemProgram,
        })
        .preInstructions([ed25519Ix])
        .signers([ctx.admin])
        .rpc();

      // price=50, size=5 → 50 * 10_000 * 5 = 2_500_000
      const expectedUsdc = BigInt(50 * 10_000 * 5);

      const posAfter = await ctx.program.account.userPosition.fetch(userPositionPda);
      expect(posAfter.yesShares.toNumber()).to.equal(posBefore.yesShares.toNumber() - 5);

      const userAfter = await getAccount(ctx.provider.connection, userUsdc);
      const vaultAfter = await getAccount(ctx.provider.connection, ctx.treasuryVaultPda);
      expect(userAfter.amount - userBefore.amount).to.equal(expectedUsdc);
      expect(vaultBefore.amount - vaultAfter.amount).to.equal(expectedUsdc);
    });

    it("SELL fails with insufficient shares", async () => {
      const ctx = getCtx();

      const quote = buildQuote(ctx, {
        side: 1,
        outcome: 0,
        size: new BN(9999),
        nonce: generateNonce(),
      });
      const message = serializeSignedQuote(quote);
      const ed25519Ix = buildEd25519Ix(ctx.quoteSigner, message);

      const [userPositionPda] = derivePositionPda(
        ctx.program.programId,
        ctx.admin.publicKey,
        marketPda,
      );
      const [usedNoncePda] = deriveNoncePda(ctx.program.programId, quote.nonce);

      const quoteArg = {
        market: quote.market,
        side: quote.side,
        outcome: quote.outcome,
        price: quote.price,
        size: quote.size,
        expiresAt: quote.expiresAt,
        nonce: Array.from(quote.nonce),
      };

      let failed = false;
      try {
        await ctx.program.methods
          .placeOrder(quoteArg)
          .accountsStrict({
            user: ctx.admin.publicKey,
            config: ctx.configPda,
            market: marketPda,
            userPosition: userPositionPda,
            usedNonce: usedNoncePda,
            userUsdc,
            treasuryVault: ctx.treasuryVaultPda,
            treasuryAuthority: ctx.treasuryAuthorityPda,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            tokenProgram: ctx.tokenProgram,
            systemProgram: ctx.systemProgram,
          })
          .preInstructions([ed25519Ix])
          .signers([ctx.admin])
          .rpc();
      } catch (err: any) {
        failed = true;
        const code = err?.error?.errorCode?.code ?? err?.toString?.() ?? "";
        expect(code).to.contain("InsufficientShares");
      }

      expect(failed, "expected insufficient shares to fail").to.equal(true);
    });

    it("rejects order on a paused market", async () => {
      const ctx = getCtx();

      // Create a dedicated market for this test so we don't interfere with the main flow
      const id = "0xpausedordertest".padEnd(66, "0");
      const idHash = sha256(id);
      const [pausedMarket] = deriveMarketPda(ctx.program.programId, idHash);

      await ctx.program.methods
        .createMarket(
          Array.from(idHash) as number[],
          id,
          Array.from(sha256("Paused order test")) as number[],
          new anchor.BN(Math.floor(Date.now() / 1000) + 60 * 60 * 24),
          100,
          "yes-paused",
          "no-paused",
        )
        .accountsStrict({
          admin: ctx.admin.publicKey,
          config: ctx.configPda,
          market: pausedMarket,
          systemProgram: ctx.systemProgram,
        })
        .signers([ctx.admin])
        .rpc();

      await ctx.program.methods
        .adminPauseMarket()
        .accountsStrict({
          config: ctx.configPda,
          admin: ctx.admin.publicKey,
          market: pausedMarket,
        })
        .signers([ctx.admin])
        .rpc();

      const quote = buildQuote(ctx, { market: pausedMarket, nonce: generateNonce() });
      const message = serializeSignedQuote(quote);
      const ed25519Ix = buildEd25519Ix(ctx.quoteSigner, message);

      const [userPositionPda] = derivePositionPda(
        ctx.program.programId,
        ctx.admin.publicKey,
        pausedMarket,
      );
      const [usedNoncePda] = deriveNoncePda(ctx.program.programId, quote.nonce);

      const quoteArg = {
        market: quote.market,
        side: quote.side,
        outcome: quote.outcome,
        price: quote.price,
        size: quote.size,
        expiresAt: quote.expiresAt,
        nonce: Array.from(quote.nonce),
      };

      let failed = false;
      try {
        await ctx.program.methods
          .placeOrder(quoteArg)
          .accountsStrict({
            user: ctx.admin.publicKey,
            config: ctx.configPda,
            market: pausedMarket,
            userPosition: userPositionPda,
            usedNonce: usedNoncePda,
            userUsdc,
            treasuryVault: ctx.treasuryVaultPda,
            treasuryAuthority: ctx.treasuryAuthorityPda,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            tokenProgram: ctx.tokenProgram,
            systemProgram: ctx.systemProgram,
          })
          .preInstructions([ed25519Ix])
          .signers([ctx.admin])
          .rpc();
      } catch (err: any) {
        failed = true;
        const code = err?.error?.errorCode?.code ?? err?.toString?.() ?? "";
        expect(code).to.contain("MarketPaused");
      }

      expect(failed, "expected paused market to reject order").to.equal(true);
    });
  });
}
