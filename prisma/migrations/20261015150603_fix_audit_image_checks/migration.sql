-- AlterTable
ALTER TABLE "image_checks" ADD COLUMN     "queued_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "screening_unchecked_marks" (
    "listing_id" UUID NOT NULL,
    "listing_version" INTEGER NOT NULL,
    "marked_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "screening_unchecked_marks_pkey" PRIMARY KEY ("listing_id","listing_version")
);

-- CreateIndex
CREATE INDEX "image_checks_pending_queued_idx" ON "image_checks"("queued_at") WHERE (status = 'pending');
