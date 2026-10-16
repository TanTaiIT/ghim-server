# Tasks

**Đã duyệt 15/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. `screening`

- [x] 1.1 Migration `fix_audit_image_retry` (enum, cột `error_kind`, backfill, CHECK); việc kiểm ghi loại lỗi;
      `retryTransient` trong `openRun`; xác minh test: lỗi kho → giữ; kho trở lại, gửi lại → ảnh kiểm lại, lượt chờ ảnh;
      lỗi thật → gửi lại giữ ngay, không việc kiểm; test DB của CHECK
- [x] 1.2 Quét lại khi đổi cụm mức chắc đang bật và khi bật lại (`sendRescans`); xác minh test: nâng mức, bỏ ngoại lệ, bật
      lại sau lượt quét lỗi đều rút tin; nới ngoại lệ, hạ mức, cụm chạy thử không gửi việc
- [x] 1.3 Kết luận đọc qua `tx`, phần đọc trong savepoint, lỗi → giữ cho người; lưới an toàn và kết luận khi ảnh về chạy
      lần lượt; xác minh test: lỗi đọc lúc gửi → 200, giữ cho người, tin chờ duyệt; test DB: savepoint quay về và
      transaction ghi tiếp được

## 2. `trust`

- [x] 2.1 `withAccountLock`; `recompute` đọc và ghi trong cùng transaction dưới khoá; xác minh test: lượt tính bị chặn giữa
      chừng trong lúc tin bị gỡ vì vi phạm → mức cuối T0
- [x] 2.2 Cổng `listing.stateOf`; bên nghe vô hiệu / khôi phục theo trạng thái hiện tại; xác minh test: gỡ → khiếu nại
      thắng → xử lại lượt gỡ → tin vẫn sạch, mức không đổi

## 3. Tài liệu và kiểm tra tích hợp

- [x] 3.1 `docs/RA-SOAT-15-10-2026.md` (T21–T24), `docs/VIEC-DANG-DO.md`, CLAUDE.md
- [x] 3.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
