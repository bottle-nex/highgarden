/*
  Warnings:

  - A unique constraint covering the columns `[bullJobId]` on the table `Hedge` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clientOrderId]` on the table `Hedge` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "HedgerEventLevel" AS ENUM ('INFO', 'WARN', 'ERROR', 'ALERT');

-- CreateEnum
CREATE TYPE "ResolverStage" AS ENUM ('PENDING', 'POLYMARKET_RESOLVED', 'SOLANA_RESOLVED', 'REDEEMED');

-- AlterEnum
ALTER TYPE "HedgeStatus" ADD VALUE 'HEDGING';

-- AlterTable
ALTER TABLE "Exposure" ADD COLUMN     "lastDecrementAt" TIMESTAMP(3),
ADD COLUMN     "lastIncrementAt" TIMESTAMP(3),
ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trackerEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Hedge" ADD COLUMN     "bullJobId" TEXT,
ADD COLUMN     "clientOrderId" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "polymarketSide" "Side",
ADD COLUMN     "polymarketTokenId" TEXT,
ADD COLUMN     "requestedSize" INTEGER;

-- CreateTable
CREATE TABLE "BotCursor" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastProcessedSignature" TEXT,
    "lastProcessedSlot" BIGINT,
    "liveStreamConnectedAt" TIMESTAMP(3),
    "liveStreamDisconnectedAt" TIMESTAMP(3),
    "pollerLastRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolverState" (
    "marketId" TEXT NOT NULL,
    "stage" "ResolverStage" NOT NULL DEFAULT 'PENDING',
    "polymarketResolvedAt" TIMESTAMP(3),
    "winningOutcome" "Outcome",
    "solanaResolveTxSig" TEXT,
    "solanaResolvedAt" TIMESTAMP(3),
    "polymarketRedeemedAt" TIMESTAMP(3),
    "polymarketRedeemTxHash" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResolverState_pkey" PRIMARY KEY ("marketId")
);

-- CreateTable
CREATE TABLE "HedgerEvent" (
    "id" BIGSERIAL NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" "HedgerEventLevel" NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,

    CONSTRAINT "HedgerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HedgerEvent_ts_idx" ON "HedgerEvent"("ts");

-- CreateIndex
CREATE INDEX "HedgerEvent_level_idx" ON "HedgerEvent"("level");

-- CreateIndex
CREATE INDEX "HedgerEvent_category_idx" ON "HedgerEvent"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Hedge_bullJobId_key" ON "Hedge"("bullJobId");

-- CreateIndex
CREATE UNIQUE INDEX "Hedge_clientOrderId_key" ON "Hedge"("clientOrderId");
