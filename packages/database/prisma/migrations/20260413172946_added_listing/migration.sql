-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Listing" (
    "marketId" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'PENDING',
    "volume24hUsd" DOUBLE PRECISION,
    "liquidityUsd" DOUBLE PRECISION,
    "lastSyncedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("marketId")
);

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
