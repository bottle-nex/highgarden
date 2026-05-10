/*
  Warnings:

  - A unique constraint covering the columns `[nettedFromInventoryId]` on the table `Fill` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "InventoryReason" AS ENUM ('SOLANA_FAILED_AFTER_HEDGE', 'MANUAL', 'OTHER');

-- AlterTable
ALTER TABLE "Fill" ADD COLUMN     "nettedFromInventoryId" TEXT;

-- CreateTable
CREATE TABLE "PlatformInventory" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "polymarketOrderId" TEXT NOT NULL,
    "polymarketTokenId" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "shares" INTEGER NOT NULL,
    "avgPriceCents" INTEGER NOT NULL,
    "reason" "InventoryReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nettedAt" TIMESTAMP(3),
    "liquidatedAt" TIMESTAMP(3),
    "liquidateOrderId" TEXT,
    "notes" TEXT,

    CONSTRAINT "PlatformInventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInventory_polymarketOrderId_key" ON "PlatformInventory"("polymarketOrderId");

-- CreateIndex
CREATE INDEX "PlatformInventory_marketId_nettedAt_liquidatedAt_idx" ON "PlatformInventory"("marketId", "nettedAt", "liquidatedAt");

-- CreateIndex
CREATE INDEX "PlatformInventory_createdAt_idx" ON "PlatformInventory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Fill_nettedFromInventoryId_key" ON "Fill"("nettedFromInventoryId");

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_nettedFromInventoryId_fkey" FOREIGN KEY ("nettedFromInventoryId") REFERENCES "PlatformInventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformInventory" ADD CONSTRAINT "PlatformInventory_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
