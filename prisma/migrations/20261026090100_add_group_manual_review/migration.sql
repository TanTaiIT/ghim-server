-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "manual_review" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "review_tasks" ADD COLUMN     "group_manual" BOOLEAN NOT NULL DEFAULT false;

