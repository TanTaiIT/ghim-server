-- Đổi tên chứ không xoá: `avatar_url` chưa từng được ghi, nhưng RENAME giữ đúng luật "không mất dữ liệu khi đổi tên".
ALTER TABLE "accounts" RENAME COLUMN "avatar_url" TO "google_picture_url";

-- AlterTable
ALTER TABLE "accounts"
ADD COLUMN     "avatar_from_google" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "avatar_image_id" UUID;

-- ── CHECK viết tay (tên trùng comment `///` ở model) ─────────────────────────────────────────────
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_avatar_source_check" CHECK (NOT ("avatar_image_id" IS NOT NULL AND "avatar_from_google")),
  ADD CONSTRAINT "accounts_avatar_google_check" CHECK (NOT "avatar_from_google" OR "google_picture_url" IS NOT NULL);
