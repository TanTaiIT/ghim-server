# Tasks

**Đã duyệt 15/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Tin đăng

- [x] 1.1 T14: `keepSystemColumns` ở lượt gửi, sửa không qua máy, lưu nháp; xác minh test: nhóm riêng tư hoá trong lúc
      sửa tiêu đề → tin vẫn "chỉ thành viên"; huy hiệu bị gỡ trong lúc bật "giao tận nơi" → không mang huy hiệu
- [x] 1.2 T15: cửa `lockAccountStatus`, `lockStatus`; `assertStillPostable` ở lượt gửi và chuyển lên sàn; xác minh test:
      danh mục tắt trong lúc gửi → 409 `CATEGORY_DISABLED`, nháp vẫn là nháp; tài khoản bị khoá trong lúc gửi → 403
- [x] 1.3 T16: `liveWhere` bỏ tin tạm ẩn; xác minh test: T0 có 9 tin hiển thị và 1 tin chờ duyệt trong nhóm đã đóng gửi
      tin mới → được gửi

## 2. Tài liệu và kiểm tra tích hợp

- [x] 2.1 `docs/RA-SOAT-15-10-2026.md` (T14, T15, T16), `docs/VIEC-DANG-DO.md`, CLAUDE.md
- [x] 2.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
