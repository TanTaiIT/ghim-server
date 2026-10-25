-- CreateTable
CREATE TABLE "saved_listings" (
    "account_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saved_listings_pkey" PRIMARY KEY ("account_id","listing_id")
);

-- CreateIndex
CREATE INDEX "saved_listings_account_id_saved_at_listing_id_idx" ON "saved_listings"("account_id", "saved_at" DESC, "listing_id" DESC);

-- CreateIndex
CREATE INDEX "saved_listings_listing_id_idx" ON "saved_listings"("listing_id");

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

