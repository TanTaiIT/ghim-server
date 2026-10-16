# Tasks

**Đã duyệt 16/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Ma trận

- [x] 1.1 Ngữ cảnh: `group()` trả `state`; `isMember`, `isBanned`; cổng `group` thêm `isBanned`, nối ở `app.ts`
- [x] 1.2 Luật từng dòng N3, N6, N10–N14, N26–N28 (design mục 2); xác minh test: mỗi dòng có một ca trạng thái đã đi tiếp
      → không ai nhận gì; N27 đã gỡ cấm → câu của N26
- [x] 1.3 Test ma trận N1–N30 dựng trạng thái thật cho các dòng trên

## 2. Tài liệu và kiểm tra tích hợp

- [x] 2.1 `docs/VIEC-DANG-DO.md` (dòng "Làm tiếp" cũ), CLAUDE.md
- [x] 2.2 `pnpm run check` (cả test DB, Docker ở máy này), `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
