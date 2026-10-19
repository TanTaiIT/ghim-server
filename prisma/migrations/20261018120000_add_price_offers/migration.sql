-- CreateEnum
CREATE TYPE "message_kind" AS ENUM ('text', 'offer');

-- CreateEnum
CREATE TYPE "offer_status" AS ENUM ('pending', 'accepted', 'declined', 'superseded');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "kind" "message_kind" NOT NULL DEFAULT 'text',
ADD COLUMN     "offer_amount" BIGINT,
ADD COLUMN     "offer_responded_at" TIMESTAMPTZ(3),
ADD COLUMN     "offer_status" "offer_status";

-- CreateIndex
CREATE UNIQUE INDEX "messages_one_pending_offer" ON "messages"("conversation_id") WHERE (offer_status = 'pending');


-- CHECK viết tay (add-price-offers, design mục 1): tin nhắn chữ có chữ và không mang cột đề nghị; đề nghị giá không có
-- chữ, có số tiền dương, có trạng thái, và có lúc trả lời đúng khi đã chấp nhận hay từ chối. `IS NOT NULL` viết rõ:
-- CHECK cho qua khi biểu thức ra NULL, nên `offer_amount > 0` một mình để lọt đề nghị không có số tiền.
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_check" CHECK (
  ("kind" = 'text' AND "body" <> '' AND "offer_amount" IS NULL AND "offer_status" IS NULL AND "offer_responded_at" IS NULL)
  OR ("kind" = 'offer' AND "body" = '' AND "offer_amount" IS NOT NULL AND "offer_amount" > 0 AND "offer_status" IS NOT NULL
      AND (("offer_status" IN ('accepted', 'declined')) = ("offer_responded_at" IS NOT NULL)))
);
