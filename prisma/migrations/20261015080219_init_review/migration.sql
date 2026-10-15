-- CreateEnum
CREATE TYPE "review_reason" AS ENUM ('machine_hold', 'machine_restricted', 'group_escalation', 'sample_risk', 'sample_reviewer');

-- CreateEnum
CREATE TYPE "review_task_status" AS ENUM ('open', 'decided', 'cancelled');

-- CreateEnum
CREATE TYPE "review_close_cause" AS ENUM ('decided', 'expired', 'machine_passed', 'edited', 'withdrawn', 'listing_closed', 'listing_deleted', 'member_left', 'group_closed');

-- CreateEnum
CREATE TYPE "review_outcome" AS ENUM ('pass', 'reject', 'remove', 'detach', 'dismiss', 'restore');

-- CreateEnum
CREATE TYPE "review_severity" AS ENUM ('mistake', 'violation');

-- CreateEnum
CREATE TYPE "review_machine_judgment" AS ENUM ('machine_right', 'machine_overreach');

-- CreateEnum
CREATE TYPE "review_actor_role" AS ENUM ('master', 'staff', 'moderator', 'owner');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "fault_reason" TEXT;

-- CreateTable
CREATE TABLE "review_tasks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "listing_id" UUID NOT NULL,
    "status" "review_task_status" NOT NULL DEFAULT 'open',
    "reasons" "review_reason"[],
    "queue" SMALLINT NOT NULL,
    "category_id" UUID,
    "group_id" UUID,
    "unit_id" UUID,
    "placement" "listing_placement",
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "escalated_at" TIMESTAMPTZ(3),
    "excluded_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "escalated_by" UUID,
    "escalation_note" TEXT,
    "sampled_decision_id" UUID,
    "claimed_by" UUID,
    "claim_expires_at" TIMESTAMPTZ(3),
    "claimed_version" INTEGER,
    "reminded_at" TIMESTAMPTZ(3),
    "close_cause" "review_close_cause",
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "review_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decisions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "task_id" UUID,
    "listing_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_role" "review_actor_role" NOT NULL,
    "outcome" "review_outcome" NOT NULL,
    "severity" "review_severity",
    "reason_template_id" UUID,
    "reason_text" TEXT,
    "note" TEXT,
    "machine_judgment" "review_machine_judgment",
    "machine_outcome" "screening_outcome",
    "machine_hits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "task_reasons" "review_reason"[] DEFAULT ARRAY[]::"review_reason"[],
    "queue" SMALLINT,
    "listing_state_after" "listing_state" NOT NULL,
    "poster_tier_after" "trust_tier",
    "overturns_decision_id" UUID,
    "decided_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reason_templates" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "review_reason_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_sample_candidates" (
    "listing_id" UUID NOT NULL,
    "listing_version" INTEGER NOT NULL,
    "went_live_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "review_sample_candidates_pkey" PRIMARY KEY ("listing_id","listing_version")
);

-- CreateIndex
CREATE INDEX "review_tasks_open_category_idx" ON "review_tasks"("category_id") WHERE (status = 'open');

-- CreateIndex
CREATE INDEX "review_tasks_open_group_idx" ON "review_tasks"("group_id") WHERE (status = 'open');

-- CreateIndex
CREATE INDEX "review_tasks_open_due_idx" ON "review_tasks"("due_at") WHERE (status = 'open');

-- CreateIndex
CREATE INDEX "review_tasks_closed_idx" ON "review_tasks"("closed_at") WHERE (status <> 'open');

-- CreateIndex
CREATE UNIQUE INDEX "review_tasks_open_listing_key" ON "review_tasks"("listing_id") WHERE (status = 'open');

-- CreateIndex
CREATE INDEX "review_decisions_actor_id_decided_at_idx" ON "review_decisions"("actor_id", "decided_at");

-- CreateIndex
CREATE INDEX "review_decisions_listing_id_decided_at_idx" ON "review_decisions"("listing_id", "decided_at");

-- CreateIndex
CREATE INDEX "review_decisions_overturns_idx" ON "review_decisions"("overturns_decision_id") WHERE (overturns_decision_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "review_reason_templates_text_key" ON "review_reason_templates"("text");

-- AddForeignKey
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sample_candidates" ADD CONSTRAINT "review_sample_candidates_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── CHECK viết tay (tên trùng comment `///` ở model) ─────────────────────────────────────────────
ALTER TABLE "listings"
  ADD CONSTRAINT "listings_fault_reason_check" CHECK ("fault_reason" IS NULL OR "fault" IS NOT NULL);

ALTER TABLE "review_tasks"
  ADD CONSTRAINT "review_tasks_reasons_check" CHECK ("status" <> 'open' OR COALESCE(cardinality("reasons"), 0) > 0),
  ADD CONSTRAINT "review_tasks_queue_check" CHECK ("queue" BETWEEN 0 AND 5),
  ADD CONSTRAINT "review_tasks_claim_check" CHECK (("claimed_by" IS NULL) = ("claim_expires_at" IS NULL) AND ("claimed_by" IS NULL) = ("claimed_version" IS NULL)),
  ADD CONSTRAINT "review_tasks_closed_check" CHECK (("status" = 'open') = ("closed_at" IS NULL) AND ("status" = 'open') = ("close_cause" IS NULL));

ALTER TABLE "review_decisions"
  ADD CONSTRAINT "review_decisions_severity_check" CHECK (("outcome" IN ('reject', 'remove')) = ("severity" IS NOT NULL)),
  ADD CONSTRAINT "review_decisions_judgment_check" CHECK ("machine_judgment" IS NULL OR "outcome" = 'pass');

-- ── Sáu lý do mẫu khởi đầu (chốt 15/10/2026) — master sửa, tắt, thêm trên bàn vận hành ──────────
INSERT INTO "review_reason_templates" ("text", "sort", "updated_at") VALUES
  ('Ảnh chưa rõ sản phẩm', 1, CURRENT_TIMESTAMP),
  ('Thiếu thông tin quan trọng', 2, CURRENT_TIMESTAMP),
  ('Sai danh mục', 3, CURRENT_TIMESTAMP),
  ('Giá ghi sai', 4, CURRENT_TIMESTAMP),
  ('Tiêu đề không mô tả món hàng', 5, CURRENT_TIMESTAMP),
  ('Trùng tin đã đăng', 6, CURRENT_TIMESTAMP);
