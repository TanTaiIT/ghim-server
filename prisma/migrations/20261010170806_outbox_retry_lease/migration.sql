-- DropIndex
DROP INDEX "outbox_events_unpublished_idx";

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "outbox_events_due_idx" ON "outbox_events"("next_attempt_at") WHERE (published_at IS NULL);
