-- CreateTable
CREATE TABLE "RoundAnchorPrice" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundAnchorPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoundAnchorPrice_symbol_slotStart_idx" ON "RoundAnchorPrice"("symbol", "slotStart");

-- CreateIndex
CREATE UNIQUE INDEX "RoundAnchorPrice_symbol_slotStart_key" ON "RoundAnchorPrice"("symbol", "slotStart");
