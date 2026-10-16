# Tasks

**Đã duyệt 15/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Phiên

- [x] 1.1 T11: con số `identity.refreshGraceSeconds`; token vừa bị thay gửi lại trong khoảng đó → 409 `REFRESH_CONFLICT`,
      không thu hồi; xác minh test: trong 30 giây → 409, phiên còn; sau 30 giây → 401, phiên bị thu hồi

## 2. Đổi email

- [x] 2.1 Migration: `email_changed`; tiêu mã đổi email còn sống
- [x] 2.2 T12 xin đổi: `currentPassword`, `totpCode`; `PASSWORD_NOT_SET`; xác minh test: sai mật khẩu → 401 không gửi
      mã, thiếu mã lớp hai → 401, chỉ Google → 409
- [x] 2.3 T12 xác nhận: thu hồi phiên khác, job thư báo email cũ; xác minh test: phiên khác 401 `SESSION_REVOKED`, phiên
      đang dùng còn, thư báo tới email cũ có email mới đã che
- [x] 2.4 Rate limit ba route `/me` kiểm bí mật

## 3. Tài liệu và kiểm tra tích hợp

- [x] 3.1 `docs/RA-SOAT-15-10-2026.md` (T11, T12), `docs/VIEC-DANG-DO.md`, CLAUDE.md
- [x] 3.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
