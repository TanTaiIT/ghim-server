-- fix-audit-identity-low (L1): mở khoá trả tài khoản về trạng thái lúc khoá, không luôn về `active`.

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "status_before_lock" "account_status";

-- Tài khoản đang khoá lúc migrate: ghi `active` — đúng điều lượt mở khoá cũ sẽ làm.
UPDATE "accounts" SET "status_before_lock" = 'active' WHERE "status" = 'locked';

-- ── CHECK viết tay (tên trùng comment `///` ở model) ─────────────────────────────────────────────
-- `IS NOT NULL AND … IN (…)`: riêng `IN` gặp NULL ra NULL, mà CHECK coi NULL là đạt.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_status_before_lock_check" CHECK (
    CASE WHEN "status" = 'locked'
      THEN "status_before_lock" IS NOT NULL AND "status_before_lock" IN ('active', 'pending_verification')
      ELSE "status_before_lock" IS NULL
    END
  );
