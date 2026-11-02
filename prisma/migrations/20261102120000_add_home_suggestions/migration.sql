-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "personalized_suggestions" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "listing_views" (
    "account_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 1,
    "last_viewed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "listing_views_pkey" PRIMARY KEY ("account_id","listing_id")
);

-- CreateTable
CREATE TABLE "search_history" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "q_folded" TEXT,
    "category_id" UUID,
    "province_code" INTEGER,
    "price_min" BIGINT,
    "price_max" BIGINT,
    "searched_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_views_account_id_last_viewed_at_idx" ON "listing_views"("account_id", "last_viewed_at" DESC);

-- CreateIndex
CREATE INDEX "listing_views_last_viewed_at_idx" ON "listing_views"("last_viewed_at");

-- CreateIndex
CREATE INDEX "search_history_account_id_searched_at_idx" ON "search_history"("account_id", "searched_at" DESC);

-- CreateIndex
CREATE INDEX "search_history_searched_at_idx" ON "search_history"("searched_at");

-- AddForeignKey
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Viết tay (Prisma không sinh CHECK): mỗi dòng là ít nhất một lượt mở tin.
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_count_check" CHECK (view_count IS NOT NULL AND view_count >= 1);
