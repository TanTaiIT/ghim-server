-- CreateEnum
CREATE TYPE "trust_tier" AS ENUM ('T0', 'T1', 'T2', 'T3');

-- CreateEnum
CREATE TYPE "trust_clean_via" AS ENUM ('shown', 'sold');

-- CreateEnum
CREATE TYPE "trust_void_cause" AS ENUM ('violation', 'report');

-- CreateTable
CREATE TABLE "trust_clean_listings" (
    "listing_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "via" "trust_clean_via",
    "clean_at" TIMESTAMPTZ(3),
    "voided_at" TIMESTAMPTZ(3),
    "void_cause" "trust_void_cause",

    CONSTRAINT "trust_clean_listings_pkey" PRIMARY KEY ("listing_id")
);

-- CreateTable
CREATE TABLE "trust_tiers" (
    "account_id" UUID NOT NULL,
    "tier" "trust_tier" NOT NULL,
    "counted_clean" INTEGER NOT NULL,
    "facts_hash" TEXT NOT NULL,
    "config_version" INTEGER NOT NULL,
    "computed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trust_tiers_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "trust_tier_changes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "from_tier" "trust_tier" NOT NULL,
    "to_tier" "trust_tier" NOT NULL,
    "facts_hash" TEXT NOT NULL,
    "config_version" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trust_tier_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trust_clean_listings_account_id_idx" ON "trust_clean_listings"("account_id");

-- CreateIndex
CREATE INDEX "trust_tiers_config_version_idx" ON "trust_tiers"("config_version");

-- CreateIndex
CREATE INDEX "trust_tier_changes_account_id_at_idx" ON "trust_tier_changes"("account_id", "at");

-- AddForeignKey
ALTER TABLE "trust_clean_listings" ADD CONSTRAINT "trust_clean_listings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_tiers" ADD CONSTRAINT "trust_tiers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_tier_changes" ADD CONSTRAINT "trust_tier_changes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CHECK viết tay (tên trùng comment `///` ở model) ─────────────────────────────────────────────
ALTER TABLE "trust_clean_listings"
  ADD CONSTRAINT "trust_clean_listings_clean_check" CHECK (("clean_at" IS NULL) = ("via" IS NULL)),
  ADD CONSTRAINT "trust_clean_listings_void_check" CHECK (("voided_at" IS NULL) = ("void_cause" IS NULL)),
  ADD CONSTRAINT "trust_clean_listings_fact_check" CHECK ("clean_at" IS NOT NULL OR "voided_at" IS NOT NULL);

ALTER TABLE "trust_tiers"
  ADD CONSTRAINT "trust_tiers_counted_check" CHECK ("counted_clean" >= 0);

ALTER TABLE "trust_tier_changes"
  ADD CONSTRAINT "trust_tier_changes_change_check" CHECK ("from_tier" <> "to_tier");
