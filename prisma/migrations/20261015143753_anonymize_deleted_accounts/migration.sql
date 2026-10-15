-- Tài khoản đã xoá quá thời gian chờ mà email được dùng lại thì được ẩn danh thay vì xoá cứng (change
-- fix-audit-stuck-data, C9): dòng giữ lịch sử chống gian lận nhưng không còn mật khẩu hay mã Google.
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_credential_check",
  ADD CONSTRAINT "accounts_credential_check"
    CHECK ("status" = 'deleted' OR "password_hash" IS NOT NULL OR "google_sub" IS NOT NULL);
