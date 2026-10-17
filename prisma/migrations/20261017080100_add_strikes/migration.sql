-- CreateEnum
CREATE TYPE "strike_kind" AS ENUM ('normal', 'severe', 'serious');

-- CreateEnum
CREATE TYPE "strike_status" AS ENUM ('active', 'expired', 'cancelled', 'permanent', 'lifted');

-- CreateEnum
CREATE TYPE "strike_cancel_cause" AS ENUM ('appeal', 'amnesty', 'serious_cancel');

-- CreateEnum
CREATE TYPE "serious_decision" AS ENUM ('permanent', 'downgrade', 'cancel');

-- CreateEnum
CREATE TYPE "appeal_channel" AS ENUM ('app', 'support');

-- CreateEnum
CREATE TYPE "appeal_status" AS ENUM ('pending', 'won', 'lost', 'closed');

-- AlterTable
ALTER TABLE "account_flags" ADD COLUMN     "related_strike_id" UUID;

-- AlterTable
ALTER TABLE "review_decisions" ADD COLUMN     "issued_strike_id" UUID,
ADD COLUMN     "strike_id" UUID;

-- AlterTable
ALTER TABLE "review_tasks" ADD COLUMN     "strike_id" UUID;

-- CreateTable
CREATE TABLE "rule_articles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rule_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strikes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "kind" "strike_kind" NOT NULL,
    "status" "strike_status" NOT NULL DEFAULT 'active',
    "points" INTEGER NOT NULL,
    "rule_article_id" UUID NOT NULL,
    "rule_text" TEXT NOT NULL,
    "issued_by" UUID NOT NULL,
    "issued_by_role" "review_actor_role" NOT NULL,
    "category_id" UUID,
    "from_report" BOOLEAN NOT NULL DEFAULT false,
    "listing_id" UUID,
    "decision_id" UUID,
    "email_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inherited_from_id" UUID,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_cause" "strike_cancel_cause",
    "cancelled_by" UUID,
    "serious_decision" "serious_decision",
    "serious_decided_at" TIMESTAMPTZ(3),
    "serious_decided_by" UUID,
    "permanent_review_at" TIMESTAMPTZ(3),
    "lifted_at" TIMESTAMPTZ(3),
    "lifted_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strikes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strike_appeals" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "strike_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "channel" "appeal_channel" NOT NULL,
    "statement" TEXT NOT NULL,
    "status" "appeal_status" NOT NULL DEFAULT 'pending',
    "filed_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by" UUID,

    CONSTRAINT "strike_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strike_comments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "strike_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "strike_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rule_articles_code_key" ON "rule_articles"("code");

-- CreateIndex
CREATE INDEX "strikes_account_id_status_idx" ON "strikes"("account_id", "status");

-- CreateIndex
CREATE INDEX "strikes_active_expiry_idx" ON "strikes"("status", "expires_at") WHERE (status = 'active');

-- CreateIndex
CREATE INDEX "strikes_permanent_review_idx" ON "strikes"("permanent_review_at") WHERE (status = 'permanent');

-- CreateIndex
CREATE INDEX "strikes_email_hashes_idx" ON "strikes" USING GIN ("email_hashes");

-- CreateIndex
CREATE UNIQUE INDEX "strike_appeals_strike_id_key" ON "strike_appeals"("strike_id");

-- CreateIndex
CREATE INDEX "strike_appeals_account_id_idx" ON "strike_appeals"("account_id");

-- CreateIndex
CREATE INDEX "strike_comments_strike_id_created_at_idx" ON "strike_comments"("strike_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_tasks_open_strike_key" ON "review_tasks"("strike_id") WHERE (status = 'open');

-- AddForeignKey
ALTER TABLE "strikes" ADD CONSTRAINT "strikes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strikes" ADD CONSTRAINT "strikes_rule_article_id_fkey" FOREIGN KEY ("rule_article_id") REFERENCES "rule_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strike_appeals" ADD CONSTRAINT "strike_appeals_strike_id_fkey" FOREIGN KEY ("strike_id") REFERENCES "strikes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strike_comments" ADD CONSTRAINT "strike_comments_strike_id_fkey" FOREIGN KEY ("strike_id") REFERENCES "strikes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK viết tay (ghi bằng /// trên model trong schema.prisma)
ALTER TABLE "strikes"
  ADD CONSTRAINT "strikes_expiry_check" CHECK ("kind" <> 'serious' OR "expires_at" IS NULL),
  ADD CONSTRAINT "strikes_cancel_check" CHECK (
    ("status" = 'cancelled') = ("cancelled_at" IS NOT NULL)
    AND ("status" = 'cancelled') = ("cancel_cause" IS NOT NULL)
  ),
  ADD CONSTRAINT "strikes_permanent_check" CHECK ("status" NOT IN ('permanent', 'lifted') OR "serious_decision" = 'permanent'),
  ADD CONSTRAINT "strikes_lifted_check" CHECK (("status" = 'lifted') = ("lifted_at" IS NOT NULL));

ALTER TABLE "review_tasks"
  DROP CONSTRAINT "review_tasks_subject_check",
  ADD CONSTRAINT "review_tasks_subject_check" CHECK (
    ("listing_id" IS NOT NULL)::int + ("account_id" IS NOT NULL)::int + ("strike_id" IS NOT NULL)::int = 1
  );

ALTER TABLE "review_decisions"
  DROP CONSTRAINT "review_decisions_subject_check",
  ADD CONSTRAINT "review_decisions_subject_check" CHECK (
    ("listing_id" IS NOT NULL)::int + ("account_id" IS NOT NULL)::int + ("strike_id" IS NOT NULL)::int = 1
    AND ("listing_id" IS NULL) = ("listing_state_after" IS NULL)
  );
