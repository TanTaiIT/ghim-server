-- Lời mời "mù" (change fix-audit-group, rà soát T19): mời email nào cũng một dòng, kể cả email chưa có tài khoản;
-- danh sách lời mời chỉ hiện email đã che. Không mất dữ liệu: cột mới backfill từ `accounts` trước khi đặt NOT NULL.

-- AlterTable: cột mới trống trước, backfill, rồi mới NOT NULL.
ALTER TABLE "group_invitations" ADD COLUMN "email_hash" TEXT,
ADD COLUMN "email_hint" TEXT;

-- Backfill: lời mời cũ luôn có người nhận — dấu băm lấy của tài khoản, email che như `maskEmail` của `identity`
-- (ký tự đầu + `***` + `@miền`; không có `@` ở vị trí hợp lệ thì `***`).
UPDATE "group_invitations" AS gi
SET "email_hash" = a."email_hash",
    "email_hint" = CASE
      WHEN position('@' IN a."email") > 1
        THEN left(a."email", 1) || '***' || substring(a."email" FROM '@[^@]*$')
      ELSE '***'
    END
FROM "accounts" AS a
WHERE a."id" = gi."account_id";

ALTER TABLE "group_invitations" ALTER COLUMN "email_hash" SET NOT NULL,
ALTER COLUMN "email_hint" SET NOT NULL,
ALTER COLUMN "account_id" DROP NOT NULL;

-- Lời mời đang chờ: một dòng mỗi (nhóm, email) — thay cho (nhóm, tài khoản).
DROP INDEX "group_invitations_pending_key";

CREATE UNIQUE INDEX "group_invitations_pending_key" ON "group_invitations"("group_id", "email_hash") WHERE (status = 'pending');
