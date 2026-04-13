-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('OPEN', 'PAUSED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HedgeStatus" AS ENUM ('PENDING', 'FILLED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "Chain" AS ENUM ('SOLANA', 'POLYGON');

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "solanaMarketPda" TEXT,
    "polyMarketId" TEXT NOT NULL,
    "status" "MarketStatus" NOT NULL DEFAULT 'OPEN',
    "winningOutcome" "Outcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolyMarket" (
    "id" TEXT NOT NULL,
    "yesTokenId" TEXT NOT NULL,
    "noTokenId" TEXT NOT NULL,
    "tickSize" TEXT NOT NULL,
    "negRisk" BOOLEAN NOT NULL,

    CONSTRAINT "PolyMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "nonce" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "price" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "signature" TEXT NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "price" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "solanaTxSig" TEXT NOT NULL,
    "nonce" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hedge" (
    "id" TEXT NOT NULL,
    "fillId" TEXT NOT NULL,
    "polymarketOrderId" TEXT,
    "status" "HedgeStatus" NOT NULL DEFAULT 'PENDING',
    "filledSize" INTEGER NOT NULL DEFAULT 0,
    "avgPrice" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hedge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exposure" (
    "marketId" TEXT NOT NULL,
    "unhedgedUsd" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exposure_pkey" PRIMARY KEY ("marketId")
);

-- CreateTable
CREATE TABLE "TreasuryBalance" (
    "chain" "Chain" NOT NULL,
    "token" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryBalance_pkey" PRIMARY KEY ("chain","token")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "image" TEXT,
    "walletAddress" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_solanaMarketPda_key" ON "Market"("solanaMarketPda");

-- CreateIndex
CREATE UNIQUE INDEX "Market_polyMarketId_key" ON "Market"("polyMarketId");

-- CreateIndex
CREATE UNIQUE INDEX "Market_id_polyMarketId_key" ON "Market"("id", "polyMarketId");

-- CreateIndex
CREATE UNIQUE INDEX "Market_id_solanaMarketPda_key" ON "Market"("id", "solanaMarketPda");

-- CreateIndex
CREATE UNIQUE INDEX "Fill_solanaTxSig_key" ON "Fill"("solanaTxSig");

-- CreateIndex
CREATE UNIQUE INDEX "Fill_nonce_key" ON "Fill"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "Hedge_fillId_key" ON "Hedge"("fillId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_polyMarketId_fkey" FOREIGN KEY ("polyMarketId") REFERENCES "PolyMarket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_nonce_fkey" FOREIGN KEY ("nonce") REFERENCES "Quote"("nonce") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hedge" ADD CONSTRAINT "Hedge_fillId_fkey" FOREIGN KEY ("fillId") REFERENCES "Fill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exposure" ADD CONSTRAINT "Exposure_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
