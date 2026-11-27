CREATE TYPE "SolDepositStage" AS ENUM ('SWEEP', 'MINT');
CREATE TYPE "SolDepositAttemptOutcome" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- Legacy sends may have happened before their signatures were saved. Audit
-- those rows explicitly; do not infer that a missing signature means unpaid.
ALTER TABLE "SolDeposit"
    ADD COLUMN "recoveryReady" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "usdcMint" TEXT,
    ADD COLUMN "sweepDestination" TEXT,
    ADD COLUMN "sweepSlot" INTEGER;
ALTER TABLE "SolDeposit" ALTER COLUMN "recoveryReady" SET DEFAULT true;

CREATE TABLE "SolDepositAttempt" (
    "id" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "stage" "SolDepositStage" NOT NULL,
    "activeStage" "SolDepositStage",
    "signature" TEXT NOT NULL,
    "signedTransaction" BYTEA NOT NULL,
    "blockhash" TEXT NOT NULL,
    "lastValidBlockHeight" INTEGER NOT NULL,
    "preparedSlot" INTEGER NOT NULL,
    "outcome" "SolDepositAttemptOutcome" NOT NULL DEFAULT 'PENDING',
    "finalizedSlot" INTEGER,
    "expirySlot" INTEGER,
    "checkedThroughSlot" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SolDepositAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SolDepositAttempt_active_stage_check" CHECK (
        ("activeStage" IS NOT NULL AND "activeStage" = "stage" AND "outcome" IN ('PENDING', 'SUCCEEDED')) OR
        ("activeStage" IS NULL AND "outcome" IN ('FAILED', 'EXPIRED'))
    ),
    CONSTRAINT "SolDepositAttempt_depositId_fkey" FOREIGN KEY ("depositId")
        REFERENCES "SolDeposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SolDepositAttempt_signature_key" ON "SolDepositAttempt"("signature");
CREATE UNIQUE INDEX "SolDepositAttempt_depositId_activeStage_key"
    ON "SolDepositAttempt"("depositId", "activeStage");
CREATE INDEX "SolDepositAttempt_outcome_idx" ON "SolDepositAttempt"("outcome");
