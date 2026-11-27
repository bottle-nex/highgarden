CREATE TYPE "ActivityKind" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'CLAIM', 'TRADE');
CREATE TYPE "ActivityStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');
CREATE TABLE "WalletActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDING',
    "amountRaw" BIGINT NOT NULL,
    "unit" TEXT NOT NULL,
    "convertedUsdcRaw" BIGINT,
    "marketId" TEXT,
    "marketName" TEXT,
    "side" "Side",
    "outcome" "Outcome",
    "shares" INTEGER,
    "priceCents" INTEGER,
    "nonce" TEXT,
    "destination" TEXT,
    "depositId" TEXT,
    "txSignature" TEXT,
    "sweepTxSig" TEXT,
    "blockhash" TEXT,
    "lastValidBlockHeight" INTEGER,
    "error" VARCHAR(500),
    "bookkept" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "WalletActivity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WalletActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WalletActivity_sourceKey_key" ON "WalletActivity"("sourceKey");
CREATE UNIQUE INDEX "WalletActivity_depositId_key" ON "WalletActivity"("depositId");
CREATE UNIQUE INDEX "WalletActivity_txSignature_key" ON "WalletActivity"("txSignature");
CREATE INDEX "WalletActivity_userId_createdAt_id_idx" ON "WalletActivity"("userId", "createdAt", "id");
CREATE INDEX "WalletActivity_status_bookkept_idx" ON "WalletActivity"("status", "bookkept");

-- Preserve recorded history and its original timestamps; past withdrawals were never stored.
INSERT INTO "WalletActivity" ("id", "userId", "sourceKey", "kind", "status", "amountRaw", "unit", "marketId", "marketName", "side", "outcome", "shares", "priceCents", "nonce", "txSignature", "bookkept", "createdAt", "completedAt")
SELECT 'fill:' || f."id", f."userId", 'trade:' || f."solanaTxSig", 'TRADE', 'DONE', f."price"::bigint * f."size" * 10000, 'USDC', f."marketId", m."name", f."side", f."outcome", f."size", f."price", f."nonce", f."solanaTxSig", true, f."createdAt", f."createdAt"
FROM "Fill" f JOIN "Market" m ON m."id" = f."marketId" ON CONFLICT DO NOTHING;
INSERT INTO "WalletActivity" ("id", "userId", "sourceKey", "kind", "status", "amountRaw", "unit", "marketId", "marketName", "outcome", "shares", "txSignature", "bookkept", "createdAt", "completedAt")
SELECT 'claim:' || c."id", c."userId", 'claim:' || c."txSignature", 'CLAIM', 'DONE', c."payoutCents"::bigint * 10000, 'USDC', c."marketId", m."name", c."outcome", c."shares", c."txSignature", true, c."createdAt", c."createdAt"
FROM "Claim" c JOIN "Market" m ON m."id" = c."marketId" ON CONFLICT DO NOTHING;
INSERT INTO "WalletActivity" ("id", "userId", "sourceKey", "kind", "status", "amountRaw", "unit", "convertedUsdcRaw", "depositId", "txSignature", "sweepTxSig", "error", "bookkept", "createdAt", "completedAt")
SELECT 'deposit:' || d."id", d."userId", 'deposit:' || d."id", 'DEPOSIT',
CASE d."status" WHEN 'COMPLETED' THEN 'DONE'::"ActivityStatus" WHEN 'FAILED' THEN 'FAILED'::"ActivityStatus" ELSE 'PENDING'::"ActivityStatus" END,
d."solLamports", 'SOL', d."usdcMintedRaw", d."id", COALESCE(d."mintTxSig", d."sweepTxSig"), d."sweepTxSig", LEFT(d."error", 500), true, d."createdAt", d."completedAt"
FROM "SolDeposit" d ON CONFLICT DO NOTHING;
