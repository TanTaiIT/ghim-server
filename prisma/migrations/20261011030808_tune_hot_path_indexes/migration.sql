-- DropIndex
DROP INDEX "disposable_domains_active_idx";

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_revoked_idx" ON "sessions"("revoked_at") WHERE (revoked_at IS NOT NULL);
