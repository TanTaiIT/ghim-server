-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('pending_verification', 'active', 'locked', 'deleted');

-- CreateEnum
CREATE TYPE "account_role" AS ENUM ('user', 'master');

-- CreateEnum
CREATE TYPE "code_purpose" AS ENUM ('email_verify', 'password_reset', 'email_change');

-- CreateEnum
CREATE TYPE "session_revoke_reason" AS ENUM ('logout', 'evicted', 'password_changed', 'password_reset', 'revoked_by_user', 'account_locked', 'account_deleted', 'refresh_reuse');

-- CreateEnum
CREATE TYPE "account_flag_kind" AS ENUM ('many_accounts_on_device', 'device_of_locked_account');

-- CreateEnum
CREATE TYPE "disposable_domain_source" AS ENUM ('seed', 'manual');

-- CreateEnum
CREATE TYPE "id_verification_status" AS ENUM ('pending', 'verified', 'rejected');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "email_hash" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_sub" TEXT,
    "status" "account_status" NOT NULL DEFAULT 'pending_verification',
    "role" "account_role" NOT NULL DEFAULT 'user',
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "phone" TEXT,
    "totp_secret_enc" TEXT,
    "totp_enabled_at" TIMESTAMPTZ(3),
    "locked_reason" TEXT,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "email_changed_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "purpose" "code_purpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "target_email" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "second_factor_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason" "session_revoke_reason",

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_posts" (
    "device_hash" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "first_posted_at" TIMESTAMPTZ(3) NOT NULL,
    "last_posted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_posts_pkey" PRIMARY KEY ("device_hash","account_id")
);

-- CreateTable
CREATE TABLE "device_clearances" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "device_hash" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "cleared_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleared_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "device_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_flags" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "kind" "account_flag_kind" NOT NULL,
    "device_hash" TEXT NOT NULL,
    "related_account_id" UUID,
    "lookup_code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleared_at" TIMESTAMPTZ(3),
    "cleared_by" UUID,
    "cleared_reason" TEXT,

    CONSTRAINT "account_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disposable_domains" (
    "domain" TEXT NOT NULL,
    "source" "disposable_domain_source" NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),
    "removed_by" UUID,

    CONSTRAINT "disposable_domains_pkey" PRIMARY KEY ("domain")
);

-- CreateTable
CREATE TABLE "id_verifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "account_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_number_enc" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "status" "id_verification_status" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "id_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_normalized_key" ON "accounts"("email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_google_sub_key" ON "accounts"("google_sub");

-- CreateIndex
CREATE INDEX "accounts_email_hash_idx" ON "accounts"("email_hash");

-- CreateIndex
CREATE INDEX "accounts_status_created_at_idx" ON "accounts"("status", "created_at");

-- CreateIndex
CREATE INDEX "accounts_status_deleted_at_idx" ON "accounts"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_codes_live_key" ON "verification_codes"("account_id", "purpose") WHERE (consumed_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_account_id_revoked_at_last_active_at_idx" ON "sessions"("account_id", "revoked_at", "last_active_at");

-- CreateIndex
CREATE INDEX "device_posts_account_id_idx" ON "device_posts"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_clearances_device_hash_account_id_key" ON "device_clearances"("device_hash", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_flags_lookup_code_key" ON "account_flags"("lookup_code");

-- CreateIndex
CREATE INDEX "account_flags_account_id_idx" ON "account_flags"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_flags_open_key" ON "account_flags"("account_id", "kind", "device_hash") WHERE (cleared_at IS NULL);

-- CreateIndex
CREATE INDEX "disposable_domains_active_idx" ON "disposable_domains"("domain") WHERE (removed_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "id_verifications_pending_key" ON "id_verifications"("account_id") WHERE (status = 'pending');

-- CreateIndex
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events"("created_at") WHERE (published_at IS NULL);

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_posts" ADD CONSTRAINT "device_posts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_clearances" ADD CONSTRAINT "device_clearances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_flags" ADD CONSTRAINT "account_flags_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "id_verifications" ADD CONSTRAINT "id_verifications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── CHECK viết tay ──────────────────────────────────────────────────────────────────────────────
-- Prisma không biểu diễn CHECK trong schema.prisma, nên khối này nằm ngoài phần sinh tự động; mỗi
-- constraint được nhắc lại bằng comment /// ở model tương ứng, và tests/identity.db.test.ts có một
-- ca cho từng dòng. Ràng buộc đặt ở DB chứ không chỉ ở service: hai lượt ghi chen nhau vẫn phải
-- bị từ chối.

-- Phải có ít nhất một cách đăng nhập; trạng thái khoá / xoá đi đôi với mốc thời gian của nó.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_credential_check" CHECK ("password_hash" IS NOT NULL OR "google_sub" IS NOT NULL),
  ADD CONSTRAINT "accounts_locked_check" CHECK (("status" = 'locked') = ("locked_at" IS NOT NULL)),
  ADD CONSTRAINT "accounts_deleted_check" CHECK (("status" = 'deleted') = ("deleted_at" IS NOT NULL));

ALTER TABLE "verification_codes"
  ADD CONSTRAINT "verification_codes_attempts_check" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "verification_codes_target_check" CHECK ("purpose" <> 'email_change' OR "target_email" IS NOT NULL);

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_revoke_check" CHECK (("revoked_at" IS NULL) = ("revoke_reason" IS NULL));

ALTER TABLE "device_posts"
  ADD CONSTRAINT "device_posts_order_check" CHECK ("last_posted_at" >= "first_posted_at");

ALTER TABLE "account_flags"
  ADD CONSTRAINT "account_flags_cleared_check" CHECK (("cleared_at" IS NULL) = ("cleared_reason" IS NULL)),
  ADD CONSTRAINT "account_flags_related_check" CHECK ("kind" <> 'device_of_locked_account' OR "related_account_id" IS NOT NULL);

ALTER TABLE "id_verifications"
  ADD CONSTRAINT "id_verifications_reason_check" CHECK ("status" <> 'rejected' OR "reason" IS NOT NULL);
