-- CreateEnum
CREATE TYPE "conversation_kind" AS ENUM ('listing', 'support', 'group');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "kind" "conversation_kind" NOT NULL DEFAULT 'listing',
ADD COLUMN     "team_pending_since" TIMESTAMPTZ(3),
ALTER COLUMN "listing_id" DROP NOT NULL,
ALTER COLUMN "seller_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "conversations_support_queue" ON "conversations"("team_pending_since", "last_activity_at") WHERE (kind = 'support');

-- CreateIndex
CREATE INDEX "conversations_group_idx" ON "conversations"("group_id", "last_activity_at") WHERE (kind = 'group');

-- CreateIndex
CREATE UNIQUE INDEX "conversations_one_support" ON "conversations"("buyer_id") WHERE (kind = 'support');

-- CreateIndex
CREATE UNIQUE INDEX "conversations_one_group" ON "conversations"("group_id", "buyer_id") WHERE (kind = 'group');


-- CHECK viết tay (add-team-conversations, design mục 1): hội thoại về tin có tin và người đăng; hội thoại với Hỗ trợ Ghim
-- không gắn tin, người đăng hay nhóm; hội thoại với quản trị nhóm gắn đúng một nhóm. `IS NULL` / `IS NOT NULL` viết rõ
-- vì CHECK cho qua khi biểu thức ra NULL.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_check" CHECK (
  ("kind" = 'listing' AND "listing_id" IS NOT NULL AND "seller_id" IS NOT NULL AND "group_id" IS NULL
    AND "team_pending_since" IS NULL)
  OR ("kind" = 'support' AND "listing_id" IS NULL AND "seller_id" IS NULL AND "group_id" IS NULL)
  OR ("kind" = 'group' AND "group_id" IS NOT NULL AND "listing_id" IS NULL AND "seller_id" IS NULL)
);
