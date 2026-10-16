-- CreateEnum
CREATE TYPE "image_check_error_kind" AS ENUM ('transient', 'permanent');

-- AlterTable
ALTER TABLE "image_checks" ADD COLUMN     "error_kind" "image_check_error_kind";

-- Dòng lỗi có sẵn không biết là lỗi kho hay lỗi tệp: coi là lỗi tạm, để mỗi dòng được kiểm lại một lần ở lượt gửi sau
-- (lỗi thật thì lỗi lại ngay, lần này ghi đúng loại).
UPDATE "image_checks" SET "error_kind" = 'transient' WHERE "status" = 'error';

ALTER TABLE "image_checks" ADD CONSTRAINT "image_checks_error_kind_check"
  CHECK (("status" = 'error') = ("error_kind" IS NOT NULL));
