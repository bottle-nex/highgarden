-- Additive only: preserve users, wallet ciphertext and all financial history.
ALTER TABLE "ResolverState" ADD COLUMN "finalityEvidence" TEXT, ADD COLUMN "finalityObservedAt" TIMESTAMP(3), ADD COLUMN "submissionClaimedAt" TIMESTAMP(3);

CREATE TABLE "WithdrawalIntent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "destination" TEXT NOT NULL,
  "amountUnits" BIGINT NOT NULL CHECK ("amountUnits" >= 1000000),
  "approvalHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'AWAITING_APPROVAL',
  "signedTransaction" TEXT,
  "txSignature" TEXT,
  "lastValidBlockHeight" INTEGER,
  "leaseUntil" TIMESTAMP(3),
  "failure" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "WithdrawalIntent_txSignature_key" ON "WithdrawalIntent"("txSignature");
CREATE INDEX "WithdrawalIntent_userId_createdAt_idx" ON "WithdrawalIntent"("userId", "createdAt");
CREATE INDEX "WithdrawalIntent_status_leaseUntil_idx" ON "WithdrawalIntent"("status", "leaseUntil");

CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dedupeKey" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");
CREATE INDEX "NotificationOutbox_acceptedAt_availableAt_leaseUntil_idx" ON "NotificationOutbox"("acceptedAt", "availableAt", "leaseUntil");
