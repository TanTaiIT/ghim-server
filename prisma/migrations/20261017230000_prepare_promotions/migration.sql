-- DropIndex
DROP INDEX "listings_feed_category_idx";

-- DropIndex
DROP INDEX "listings_feed_idx";

-- DropIndex
DROP INDEX "listings_group_feed_idx";

-- DropIndex
DROP INDEX "listings_search_idx";

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "featured_until" TIMESTAMPTZ(3),
ADD COLUMN     "rank_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "listings_feed_idx" ON "listings"("rank_at" DESC, "id" DESC) WHERE (state = 'live' AND placement = 'marketplace' AND cardinality(hide_reasons) = 0 AND cardinality(restrictions) = 0 AND deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_feed_category_idx" ON "listings"("category_id", "rank_at" DESC, "id" DESC) WHERE (state = 'live' AND placement = 'marketplace' AND cardinality(hide_reasons) = 0 AND cardinality(restrictions) = 0 AND deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_search_idx" ON "listings"("rank_at" DESC, "id" DESC) WHERE (state = 'live' AND placement = 'marketplace' AND cardinality(hide_reasons) = 0 AND deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_group_feed_idx" ON "listings"("group_id", "rank_at" DESC, "id" DESC) WHERE (state = 'live' AND cardinality(hide_reasons) = 0 AND deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_featured_idx" ON "listings"("featured_until") WHERE (featured_until IS NOT NULL);


-- Vị trí xếp hạng chép từ mốc lên bảng (TK 30 `rankAt`, change prepare-promotions): hai cột bằng nhau tới khi có gói đẩy
-- tin; CHECK giữ chúng đi cùng nhau — tin chưa lên bảng thì chưa có vị trí.
UPDATE "listings" SET "rank_at" = "first_live_at" WHERE "rank_at" IS NULL;

ALTER TABLE "listings"
  ADD CONSTRAINT "listings_rank_check" CHECK (("rank_at" IS NULL) = ("first_live_at" IS NULL));
