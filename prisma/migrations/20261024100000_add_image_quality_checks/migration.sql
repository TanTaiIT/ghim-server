-- AlterEnum
ALTER TYPE "screening_cause" ADD VALUE 'image_quality';

-- AlterEnum
ALTER TYPE "screening_rule_kind" ADD VALUE 'quality';

-- AlterTable
ALTER TABLE "image_checks" ADD COLUMN     "brightness" DOUBLE PRECISION,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "sharpness" DOUBLE PRECISION,
ADD COLUMN     "width" INTEGER;


-- Bốn số đo đi cùng nhau: ảnh kiểm trước change này trống cả bốn, ảnh kiểm sau có đủ cả bốn (add-image-quality-checks).
ALTER TABLE "image_checks" ADD CONSTRAINT "image_checks_quality_check" CHECK (
  ("width" IS NULL AND "height" IS NULL AND "sharpness" IS NULL AND "brightness" IS NULL)
  OR (
    "width" IS NOT NULL AND "height" IS NOT NULL AND "sharpness" IS NOT NULL AND "brightness" IS NOT NULL
    AND "width" > 0 AND "height" > 0 AND "sharpness" >= 0 AND "brightness" BETWEEN 0 AND 255
  )
);
