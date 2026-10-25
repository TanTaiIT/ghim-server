-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "image_ids" UUID[] DEFAULT ARRAY[]::UUID[];


-- CHECK viết tay (add-message-images): mảng không NULL như cột ảnh của tin; tối đa 4 ảnh một tin nhắn. Tin chữ có chữ
-- hoặc có ảnh (gửi riêng ảnh được); đề nghị giá vẫn không chữ và không ảnh. `IS NOT NULL` viết rõ như add_price_offers.
ALTER TABLE "messages" ADD CONSTRAINT "messages_images_check" CHECK (
  "image_ids" IS NOT NULL AND cardinality("image_ids") <= 4
);

ALTER TABLE "messages" DROP CONSTRAINT "messages_kind_check";
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_check" CHECK (
  ("kind" = 'text' AND ("body" <> '' OR cardinality("image_ids") > 0)
      AND "offer_amount" IS NULL AND "offer_status" IS NULL AND "offer_responded_at" IS NULL)
  OR ("kind" = 'offer' AND "body" = '' AND cardinality("image_ids") = 0
      AND "offer_amount" IS NOT NULL AND "offer_amount" > 0 AND "offer_status" IS NOT NULL
      AND (("offer_status" IN ('accepted', 'declined')) = ("offer_responded_at" IS NOT NULL)))
);
