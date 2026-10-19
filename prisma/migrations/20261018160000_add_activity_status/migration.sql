-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "last_seen_at" TIMESTAMPTZ(3),
ADD COLUMN     "show_activity" BOOLEAN NOT NULL DEFAULT true;

