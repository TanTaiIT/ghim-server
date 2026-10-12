-- CreateEnum
CREATE TYPE "listing_state" AS ENUM ('draft', 'checking', 'pending', 'live', 'rejected', 'sold', 'expired', 'removed');

-- CreateEnum
CREATE TYPE "listing_placement" AS ENUM ('marketplace', 'group_public', 'members_only');

-- CreateEnum
CREATE TYPE "listing_hide_reason" AS ENUM ('account_locked', 'account_deleted', 'left_group', 'removed_from_group', 'group_banned', 'group_locked', 'category_disabled', 'group_closed', 'group_privatized', 'detached_by_group');

-- CreateEnum
CREATE TYPE "listing_restriction" AS ENUM ('machine', 'new_account', 'strike');

-- CreateEnum
CREATE TYPE "listing_renewal" AS ENUM ('early', 'expired');

-- CreateEnum
CREATE TYPE "listing_fault" AS ENUM ('mistake', 'violation');

-- CreateEnum
CREATE TYPE "listing_submission_kind" AS ENUM ('submit', 'resubmit', 'renew_early', 'renew_expired', 'move');

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "owner_id" UUID NOT NULL,
    "state" "listing_state" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "placement" "listing_placement",
    "group_id" UUID,
    "unit_id" UUID,
    "category_id" UUID,
    "template_version" INTEGER,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "title" TEXT,
    "description" TEXT,
    "price" BIGINT,
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "delivery" BOOLEAN NOT NULL DEFAULT false,
    "show_phone" BOOLEAN NOT NULL DEFAULT false,
    "province_code" INTEGER,
    "ward_code" INTEGER,
    "image_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "badge_group_id" UUID,
    "hide_reasons" "listing_hide_reason"[] DEFAULT ARRAY[]::"listing_hide_reason"[],
    "restrictions" "listing_restriction"[] DEFAULT ARRAY[]::"listing_restriction"[],
    "first_live_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "clock_remaining_ms" BIGINT,
    "shown_ms" BIGINT NOT NULL DEFAULT 0,
    "shown_since" TIMESTAMPTZ(3),
    "renewal" "listing_renewal",
    "fault" "listing_fault",
    "left_group_at" TIMESTAMPTZ(3),
    "moved_from_listing_id" UUID,
    "reminded_for" TIMESTAMPTZ(3),
    "search_folded" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_submissions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "listing_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "kind" "listing_submission_kind" NOT NULL,
    "from_version" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "listing_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_badge_blocks" (
    "listing_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "removed_by" UUID NOT NULL,
    "removed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "listing_badge_blocks_pkey" PRIMARY KEY ("listing_id","group_id")
);

-- CreateIndex
CREATE INDEX "listings_feed_idx" ON "listings"("first_live_at" DESC, "id" DESC) WHERE (state = 'live' AND placement = 'marketplace' AND cardinality(hide_reasons) = 0 AND cardinality(restrictions) = 0 AND deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_feed_category_idx" ON "listings"("category_id", "first_live_at" DESC, "id" DESC) WHERE (state = 'live' AND placement = 'marketplace' AND cardinality(hide_reasons) = 0 AND cardinality(restrictions) = 0 AND deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_search_idx" ON "listings"("first_live_at" DESC, "id" DESC) WHERE (state = 'live' AND placement = 'marketplace' AND cardinality(hide_reasons) = 0 AND deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_group_feed_idx" ON "listings"("group_id", "first_live_at" DESC, "id" DESC) WHERE (state = 'live' AND cardinality(hide_reasons) = 0 AND deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_expiry_idx" ON "listings"("expires_at") WHERE (state = 'live' AND expires_at IS NOT NULL);

-- CreateIndex
CREATE INDEX "listings_group_idx" ON "listings"("group_id") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_category_idx" ON "listings"("category_id") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_badge_idx" ON "listings"("badge_group_id") WHERE (badge_group_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "listings_owner_idx" ON "listings"("owner_id", "updated_at" DESC) WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "listings_moved_from_key" ON "listings"("moved_from_listing_id") WHERE (moved_from_listing_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "listing_submissions_account_id_at_idx" ON "listing_submissions"("account_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "listing_submissions_listing_id_from_version_key" ON "listing_submissions"("listing_id", "from_version");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_ward_code_fkey" FOREIGN KEY ("ward_code") REFERENCES "wards"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_badge_group_id_fkey" FOREIGN KEY ("badge_group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_moved_from_listing_id_fkey" FOREIGN KEY ("moved_from_listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_submissions" ADD CONSTRAINT "listing_submissions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_submissions" ADD CONSTRAINT "listing_submissions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_badge_blocks" ADD CONSTRAINT "listing_badge_blocks_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_badge_blocks" ADD CONSTRAINT "listing_badge_blocks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── CHECK viết tay (tên trùng comment `///` ở model) ─────────────────────────────────────────────
ALTER TABLE "listings"
  ADD CONSTRAINT "listings_arrays_check" CHECK ("image_ids" IS NOT NULL AND "hide_reasons" IS NOT NULL AND "restrictions" IS NOT NULL),
  ADD CONSTRAINT "listings_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "listings_price_check" CHECK ("price" IS NULL OR "price" >= 0),
  ADD CONSTRAINT "listings_placement_group_check" CHECK ("placement" IS NULL OR ("placement" = 'marketplace') = ("group_id" IS NULL)),
  ADD CONSTRAINT "listings_submitted_check" CHECK ("state" = 'draft' OR ("placement" IS NOT NULL AND "title" IS NOT NULL AND "price" IS NOT NULL AND "category_id" IS NOT NULL AND cardinality("image_ids") >= 1)),
  ADD CONSTRAINT "listings_badge_check" CHECK ("badge_group_id" IS NULL OR "placement" = 'marketplace'),
  ADD CONSTRAINT "listings_ward_check" CHECK ("ward_code" IS NULL OR "province_code" IS NOT NULL),
  ADD CONSTRAINT "listings_clock_check" CHECK ("expires_at" IS NULL OR "clock_remaining_ms" IS NULL),
  ADD CONSTRAINT "listings_clock_started_check" CHECK ("first_live_at" IS NOT NULL OR ("expires_at" IS NULL AND "clock_remaining_ms" IS NULL AND "shown_since" IS NULL)),
  ADD CONSTRAINT "listings_shown_check" CHECK ("shown_ms" >= 0),
  ADD CONSTRAINT "listings_renewal_check" CHECK ("renewal" IS NULL OR "state" IN ('draft', 'checking', 'pending')),
  ADD CONSTRAINT "listings_fault_check" CHECK ("fault" IS NULL OR "state" IN ('rejected', 'removed'));
