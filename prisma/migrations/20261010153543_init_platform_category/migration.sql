-- CreateEnum
CREATE TYPE "staff_scope" AS ENUM ('support', 'user_reports', 'id_verification');

-- CreateEnum
CREATE TYPE "staff_permission_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "category_status" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "risk_level" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "group_review" AS ENUM ('group', 'platform');

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_error" TEXT;

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "actor_id" UUID NOT NULL,
    "actor_role" "account_role" NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_permissions" (
    "account_id" UUID NOT NULL,
    "scopes" "staff_scope"[],
    "status" "staff_permission_status" NOT NULL DEFAULT 'active',
    "suspended_reason" TEXT,
    "suspended_at" TIMESTAMPTZ(3),
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_permissions_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "staff_category_grants" (
    "account_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "staff_category_grants_pkey" PRIMARY KEY ("account_id","category_id")
);

-- CreateTable
CREATE TABLE "config_versions" (
    "version" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_versions_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "status" "category_status" NOT NULL DEFAULT 'active',
    "settings_version" INTEGER NOT NULL DEFAULT 1,
    "template_version" INTEGER,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_setting_versions" (
    "category_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "price_cap" BIGINT,
    "reference_price" BIGINT,
    "risk_level" "risk_level" NOT NULL DEFAULT 'low',
    "always_manual" BOOLEAN NOT NULL DEFAULT false,
    "group_review" "group_review" NOT NULL DEFAULT 'group',
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_setting_versions_pkey" PRIMARY KEY ("category_id","version")
);

-- CreateTable
CREATE TABLE "template_drafts" (
    "category_id" UUID NOT NULL,
    "fields" JSONB NOT NULL,
    "draft_version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "template_drafts_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "template_versions" (
    "category_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "published_by" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("category_id","version")
);

-- CreateTable
CREATE TABLE "provinces" (
    "code" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "former_names" TEXT[],
    "aliases" TEXT[],
    "search_text" TEXT NOT NULL,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "wards" (
    "code" INTEGER NOT NULL,
    "province_code" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "former_names" TEXT[],
    "search_text" TEXT NOT NULL,

    CONSTRAINT "wards_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "audit_log_actor_id_created_at_idx" ON "audit_log"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_target_type_target_id_created_at_idx" ON "audit_log"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "staff_category_grants_category_id_idx" ON "staff_category_grants"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "wards_province_code_idx" ON "wards"("province_code");

-- CreateIndex
CREATE UNIQUE INDEX "wards_province_code_name_key" ON "wards"("province_code", "name");

-- AddForeignKey
ALTER TABLE "staff_permissions" ADD CONSTRAINT "staff_permissions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_category_grants" ADD CONSTRAINT "staff_category_grants_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "staff_permissions"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_category_grants" ADD CONSTRAINT "staff_category_grants_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_setting_versions" ADD CONSTRAINT "category_setting_versions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_drafts" ADD CONSTRAINT "template_drafts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wards" ADD CONSTRAINT "wards_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── CHECK và trigger viết tay ────────────────────────────────────────────────────────────────
-- Prisma không biểu diễn CHECK / trigger; mỗi ràng buộc được nhắc bằng /// ở model và có một ca
-- trong tests/platform.db.test.ts, tests/category.db.test.ts.

-- Treo quyền đi đôi với mốc và lý do treo.
ALTER TABLE "staff_permissions"
  ADD CONSTRAINT "staff_permissions_suspended_at_check" CHECK (("status" = 'suspended') = ("suspended_at" IS NOT NULL)),
  ADD CONSTRAINT "staff_permissions_suspended_reason_check" CHECK (("status" = 'suspended') = ("suspended_reason" IS NOT NULL));

ALTER TABLE "config_versions"
  ADD CONSTRAINT "config_versions_version_check" CHECK ("version" >= 1);

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_settings_version_check" CHECK ("settings_version" >= 1),
  ADD CONSTRAINT "categories_template_version_check" CHECK ("template_version" IS NULL OR "template_version" >= 1);

ALTER TABLE "category_setting_versions"
  ADD CONSTRAINT "category_setting_versions_price_cap_check" CHECK ("price_cap" IS NULL OR "price_cap" >= 0),
  ADD CONSTRAINT "category_setting_versions_reference_price_check" CHECK ("reference_price" IS NULL OR "reference_price" >= 0),
  ADD CONSTRAINT "category_setting_versions_reference_le_cap_check" CHECK ("price_cap" IS NULL OR "reference_price" IS NULL OR "reference_price" <= "price_cap");

ALTER TABLE "template_drafts"
  ADD CONSTRAINT "template_drafts_draft_version_check" CHECK ("draft_version" >= 1);

-- Nhật ký chỉ ghi thêm (TK cam kết 31): chặn ngay ở DB, không dựa vào việc app "không có route".
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'P0001';
END
$$;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
