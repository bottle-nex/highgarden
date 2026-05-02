-- AlterTable
ALTER TABLE "User" ADD COLUMN "custodialPublicKey" TEXT;
ALTER TABLE "User" ADD COLUMN "custodialSecretEncrypted" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_custodialPublicKey_key" ON "User"("custodialPublicKey");
