-- Lượt xin đổi email trước bản này không qua mật khẩu: mã còn sống không được xác nhận nữa, người dùng thật
-- chỉ cần xin lại (fix-audit-identity, T12).
UPDATE "verification_codes"
SET "consumed_at" = now()
WHERE "purpose" = 'email_change' AND "consumed_at" IS NULL;
