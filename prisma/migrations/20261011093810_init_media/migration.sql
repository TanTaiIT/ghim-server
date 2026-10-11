-- CreateEnum
CREATE TYPE "image_owner_kind" AS ENUM ('profile', 'listing');

-- CreateTable
CREATE TABLE "images" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "owner_kind" "image_owner_kind" NOT NULL,
    "owner_id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "images_owner_kind_owner_id_idx" ON "images"("owner_kind", "owner_id");

-- CreateIndex
CREATE INDEX "images_uploader_id_created_at_idx" ON "images"("uploader_id", "created_at");

-- CreateIndex
CREATE INDEX "images_unconfirmed_idx" ON "images"("created_at") WHERE (confirmed_at IS NULL);

-- CreateIndex
CREATE INDEX "images_released_idx" ON "images"("released_at") WHERE (released_at IS NOT NULL);

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CHECK viết tay (tên trùng comment `///` ở model) ─────────────────────────────────────────────
ALTER TABLE "images"
  ADD CONSTRAINT "images_uploaded_check" CHECK ("confirmed_at" IS NULL OR "uploaded_at" IS NOT NULL),
  ADD CONSTRAINT "images_released_check" CHECK ("released_at" IS NULL OR "confirmed_at" IS NOT NULL),
  ADD CONSTRAINT "images_byte_size_check" CHECK ("byte_size" > 0);
