-- Differentiates regular long-form markets from short-window auto-rolling
-- markets (Polymarket BTC/ETH/SOL Up-or-Down 5-min ladders, etc).
-- Default STANDARD so existing rows are unaffected.

CREATE TYPE "MarketKind" AS ENUM (
    'STANDARD',
    'FAST_MOVING'
);

ALTER TABLE "Market"
    ADD COLUMN "kind" "MarketKind" NOT NULL DEFAULT 'STANDARD';

CREATE INDEX "Market_kind_status_idx" ON "Market"("kind", "status");
