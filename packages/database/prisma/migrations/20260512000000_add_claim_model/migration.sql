-- Records every successful on-chain `claim`. Used by PortfolioService to
-- hide already-redeemed positions across page refreshes (Fill aggregation
-- alone has no way to know the user already claimed). One row per
-- (user, market, outcome) — the on-chain handler always drains the full
-- winning-side balance, so partial claims aren't a thing.
CREATE TABLE "Claim" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "marketId"    TEXT NOT NULL,
    "outcome"     "Outcome" NOT NULL,
    "shares"      INTEGER NOT NULL,
    "payoutCents" INTEGER NOT NULL,
    "txSignature" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Claim_txSignature_key" ON "Claim"("txSignature");
CREATE UNIQUE INDEX "Claim_userId_marketId_outcome_key" ON "Claim"("userId", "marketId", "outcome");
CREATE INDEX "Claim_userId_idx" ON "Claim"("userId");

ALTER TABLE "Claim" ADD CONSTRAINT "Claim_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_marketId_fkey"
    FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
