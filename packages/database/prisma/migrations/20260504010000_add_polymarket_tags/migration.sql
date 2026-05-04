-- AlterTable
ALTER TABLE "PolyMarket" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "PolyMarket_tags_idx" ON "PolyMarket" USING GIN ("tags");
