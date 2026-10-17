-- CreateEnum
CREATE TYPE "job_run_status" AS ENUM ('done', 'partial', 'failed');

-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_listing_id_fkey";

-- DropForeignKey
ALTER TABLE "strikes" DROP CONSTRAINT "strikes_account_id_fkey";

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "purged_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "purged_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "purge_reminded_for" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "strikes" ADD COLUMN     "anonymized_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "screening_run_stats" (
    "month" DATE NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "config_version" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "rule_code" TEXT NOT NULL,
    "runs" INTEGER NOT NULL,

    CONSTRAINT "screening_run_stats_pkey" PRIMARY KEY ("month","rule_version","config_version","outcome","cause","band","rule_code")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "status" "job_run_status" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3) NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_runs_name_started_at_idx" ON "job_runs"("name", "started_at" DESC);

-- CreateIndex
CREATE INDEX "job_runs_started_at_idx" ON "job_runs"("started_at");

-- CreateIndex
CREATE INDEX "account_flags_cleared_idx" ON "account_flags"("cleared_at") WHERE (cleared_at IS NOT NULL);

-- CreateIndex
CREATE INDEX "accounts_purge_due_idx" ON "accounts"("deleted_at") WHERE (status = 'deleted' AND purged_at IS NULL);

-- CreateIndex
CREATE INDEX "conversations_retention_idx" ON "conversations"("last_activity_at");

-- CreateIndex
CREATE INDEX "device_posts_last_posted_at_idx" ON "device_posts"("last_posted_at");

-- CreateIndex
CREATE INDEX "groups_purge_due_idx" ON "groups"("closed_at") WHERE (state = 'closed' AND purged_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_retention_idx" ON "listings"("state", "updated_at") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "listings_deleted_idx" ON "listings"("deleted_at") WHERE (deleted_at IS NOT NULL);

-- CreateIndex
CREATE INDEX "listings_expired_idx" ON "listings"("expires_at") WHERE (state = 'expired');

-- CreateIndex
CREATE INDEX "notifications_retention_idx" ON "notifications"("updated_at");

-- CreateIndex
CREATE INDEX "screening_runs_retention_idx" ON "screening_runs"("started_at");

-- CreateIndex
CREATE INDEX "sessions_ip_retention_idx" ON "sessions"("created_at") WHERE (ip IS NOT NULL);

-- CreateIndex
CREATE INDEX "strikes_anonymize_due_idx" ON "strikes"("status") WHERE (anonymized_at IS NULL);


-- Nhật ký vẫn chỉ ghi thêm (TK cam kết 31), trừ một đường: ẩn danh hoá gậy của `ops` (add-data-retention) thay mã người
-- nhận bằng mã giả trong `target_id` / `details`. Chỉ transaction đặt `ghim.anonymize = 'on'` mới được UPDATE, và mọi cột
-- khác phải giữ nguyên; DELETE chặn tuyệt đối.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('ghim.anonymize', true) = 'on'
     AND NEW.id = OLD.id
     AND NEW.actor_id = OLD.actor_id
     AND NEW.actor_role = OLD.actor_role
     AND NEW.action = OLD.action
     AND NEW.target_type = OLD.target_type
     AND NEW.reason IS NOT DISTINCT FROM OLD.reason
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'P0001';
END
$$;
