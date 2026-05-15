-- Adds the FastMarketSubscription model and the Market.fastSeriesKey
-- column so the auto-lister can detect "this market belongs to a series
-- the admin is subscribed to" → auto-approve+list it.

ALTER TABLE "Market" ADD COLUMN "fastSeriesKey" TEXT;
CREATE INDEX "Market_fastSeriesKey_idx" ON "Market"("fastSeriesKey");

CREATE TABLE "FastMarketSubscription" (
    "id"        TEXT NOT NULL,
    "seriesKey" TEXT NOT NULL,
    "label"     TEXT NOT NULL,
    "enabled"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "FastMarketSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FastMarketSubscription_seriesKey_key" ON "FastMarketSubscription"("seriesKey");
CREATE INDEX "FastMarketSubscription_enabled_idx" ON "FastMarketSubscription"("enabled");
