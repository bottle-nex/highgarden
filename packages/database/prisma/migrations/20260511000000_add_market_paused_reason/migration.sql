-- Adds a free-form reason column to Market for non-OPEN states. Currently
-- only set to "UMA_DISPUTE" by the hedger's market-status poller; left
-- intentionally as a String so future reasons (e.g. EXPOSURE_LIMIT,
-- MANUAL_HOLD) don't need a new migration.
ALTER TABLE "Market" ADD COLUMN "pausedReason" TEXT;
