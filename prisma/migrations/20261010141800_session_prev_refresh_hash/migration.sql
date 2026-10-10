-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "prev_refresh_token_hash" TEXT;

-- CreateIndex
CREATE INDEX "sessions_prev_refresh_token_hash_idx" ON "sessions"("prev_refresh_token_hash");
