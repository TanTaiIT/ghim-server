-- AlterEnum
ALTER TYPE "notification_category" ADD VALUE 'saved_searches';

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "q" TEXT NOT NULL,
    "q_folded" TEXT NOT NULL,
    "category_id" UUID,
    "province_code" INTEGER,
    "ward_code" INTEGER,
    "price_min" BIGINT,
    "price_max" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_searches_account_id_created_at_idx" ON "saved_searches"("account_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "saved_searches_account_id_key_key" ON "saved_searches"("account_id", "key");

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: Prisma cannot declare CHECK. A saved search always has a keyword (spec listing/saved-searches), and a
-- price range never runs backwards.
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_q_folded_check" CHECK ("q_folded" <> '');
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_price_range_check"
  CHECK ("price_min" IS NULL OR "price_max" IS NULL OR "price_min" <= "price_max");
