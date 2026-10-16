# Tasks

**Đã duyệt 16/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Tài khoản

- [x] 1.1 L1: migration `accounts.status_before_lock` + CHECK `accounts_status_before_lock_check`; khoá ghi trạng thái
      cũ, mở khoá trả về; xác minh test HTTP: khoá rồi mở khoá tài khoản chưa xác nhận → thao tác cần email đã xác nhận 403 `EMAIL_NOT_VERIFIED`;
      tài khoản đã xác nhận → hoạt động; hai lượt khoá cùng lúc → 204 + 409; test DB: CHECK hai chiều
- [x] 1.2 L2: `clearFlag`, `decideIdVerification` chặn tự xử (403); duyệt giấy tờ có điều kiện (409); xác minh test HTTP
- [x] 1.3 L3: `openSessionCapped` — khoá theo tài khoản, đẩy phiên vượt trần và tạo phiên trong một transaction; xác minh
      test HTTP (trần hạ xuống 2): kém trần một phiên + 3 lượt đăng nhập cùng lúc → không vượt trần
- [x] 1.4 L12: mở khoá phát `identity.device.flag_cleared` cho mỗi đánh dấu gỡ; xác minh test DB / HTTP

## 2. Tài liệu và kiểm tra tích hợp

- [x] 2.1 `docs/RA-SOAT-15-10-2026.md` (L1, L2, L3 phần trần phiên, L12), `docs/VIEC-DANG-DO.md`
- [x] 2.2 `typecheck`, `lint`, `format:check`, `test:unit`, `spec:validate`, `build`, `db:drift`; test HTTP / DB trên CI
