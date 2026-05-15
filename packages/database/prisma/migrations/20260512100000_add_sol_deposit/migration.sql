-- One row per inbound SOL → USDC deposit detected on a user's custodial
-- wallet. Written by SolDepositPoller.

CREATE TYPE "SolDepositStatus" AS ENUM (
    'DETECTED',
    'SWEEPING',
    'SWEPT',
    'COMPLETED',
    'FAILED'
);

CREATE TABLE "SolDeposit" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "custodialPubkey" TEXT NOT NULL,
    "solLamports"     BIGINT NOT NULL,
    "solUsdRateCents" INTEGER NOT NULL,
    "usdcMintedRaw"   BIGINT NOT NULL,
    "sweepTxSig"      TEXT,
    "mintTxSig"       TEXT,
    "status"          "SolDepositStatus" NOT NULL DEFAULT 'DETECTED',
    "error"           TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"     TIMESTAMP(3),
    CONSTRAINT "SolDeposit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SolDeposit_sweepTxSig_key" ON "SolDeposit"("sweepTxSig");
CREATE UNIQUE INDEX "SolDeposit_mintTxSig_key"  ON "SolDeposit"("mintTxSig");
CREATE INDEX "SolDeposit_userId_createdAt_idx"   ON "SolDeposit"("userId", "createdAt");
CREATE INDEX "SolDeposit_status_idx"             ON "SolDeposit"("status");
CREATE INDEX "SolDeposit_custodialPubkey_idx"    ON "SolDeposit"("custodialPubkey");

ALTER TABLE "SolDeposit" ADD CONSTRAINT "SolDeposit_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
