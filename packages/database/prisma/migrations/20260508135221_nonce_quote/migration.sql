-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "nonceClosedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Quote_consumed_nonceClosedAt_expiresAt_idx" ON "Quote"("consumed", "nonceClosedAt", "expiresAt");
