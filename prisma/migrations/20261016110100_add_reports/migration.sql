-- CreateEnum
CREATE TYPE "report_category" AS ENUM ('fraud', 'misinformation', 'harassment', 'prohibited', 'other');

-- CreateEnum
CREATE TYPE "report_subject_kind" AS ENUM ('listing', 'account');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('open', 'upheld', 'dismissed');

-- CreateEnum
CREATE TYPE "report_verdict" AS ENUM ('upheld', 'dismissed');

-- AlterTable
ALTER TABLE "review_decisions" ADD COLUMN     "account_id" UUID,
ADD COLUMN     "report_id" UUID,
ADD COLUMN     "report_verdict" "report_verdict",
ALTER COLUMN "listing_id" DROP NOT NULL,
ALTER COLUMN "listing_state_after" DROP NOT NULL;

-- AlterTable
ALTER TABLE "review_tasks" ADD COLUMN     "account_id" UUID,
ALTER COLUMN "listing_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "subject_kind" "report_subject_kind" NOT NULL,
    "listing_id" UUID,
    "account_id" UUID NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "severe" BOOLEAN NOT NULL DEFAULT false,
    "low_priority" BOOLEAN NOT NULL DEFAULT false,
    "auto_hidden_at" TIMESTAMPTZ(3),
    "decision_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_entries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "report_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "category" "report_category" NOT NULL,
    "device_hash" TEXT,
    "counts_for_hide" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "report_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporter_scores" (
    "account_id" UUID NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "suspended_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reporter_scores_pkey" PRIMARY KEY ("account_id")
);

-- CreateIndex
CREATE INDEX "reports_account_id_created_at_idx" ON "reports"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_listing_id_created_at_idx" ON "reports"("listing_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reports_open_listing_key" ON "reports"("listing_id") WHERE (status = 'open');

-- CreateIndex
CREATE UNIQUE INDEX "reports_open_account_key" ON "reports"("account_id") WHERE (status = 'open' AND subject_kind = 'account');

-- CreateIndex
CREATE INDEX "report_entries_reporter_id_created_at_idx" ON "report_entries"("reporter_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_entries_report_id_reporter_id_key" ON "report_entries"("report_id", "reporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_tasks_open_account_key" ON "review_tasks"("account_id") WHERE (status = 'open');

-- AddForeignKey
ALTER TABLE "report_entries" ADD CONSTRAINT "report_entries_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK viết tay (ghi bằng /// trên model trong schema.prisma)
ALTER TABLE "reports"
  ADD CONSTRAINT "reports_subject_check" CHECK (("subject_kind" = 'listing') = ("listing_id" IS NOT NULL)),
  ADD CONSTRAINT "reports_decided_check" CHECK (("status" = 'open') = ("decided_at" IS NULL));

ALTER TABLE "review_tasks"
  ADD CONSTRAINT "review_tasks_subject_check" CHECK (("listing_id" IS NULL) <> ("account_id" IS NULL)),
  DROP CONSTRAINT "review_tasks_claim_check",
  ADD CONSTRAINT "review_tasks_claim_check" CHECK (
    ("claimed_by" IS NULL) = ("claim_expires_at" IS NULL)
    AND ("claimed_by" IS NOT NULL OR "claimed_version" IS NULL)
    AND ("claimed_by" IS NULL OR "listing_id" IS NULL OR "claimed_version" IS NOT NULL)
  );

ALTER TABLE "review_decisions"
  ADD CONSTRAINT "review_decisions_subject_check" CHECK (
    ("listing_id" IS NULL) <> ("account_id" IS NULL)
    AND ("listing_id" IS NULL) = ("listing_state_after" IS NULL)
  ),
  ADD CONSTRAINT "review_decisions_report_check" CHECK (("report_id" IS NULL) = ("report_verdict" IS NULL));
