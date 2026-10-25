# Tasks

Duyệt 25/10/2026 (người dùng chọn "Mới nhất · giá tăng · giá giảm").

## 1. Server

- [x] 1.1 `common/schemas/cursor.ts`: con trỏ dạng số `[số, mã]` cho danh sách đổi được cách xếp; con trỏ thời gian giữ
      nguyên định dạng
- [x] 1.2 `listing` repository: thứ tự `price_asc` / `price_desc` (hoà theo mã) và trang sau con trỏ giá; `feed` nhận
      `sort` (`newest` mặc định)
- [x] 1.3 Test HTTP mọi scenario của "Sắp xếp theo giá" (`listing-sort.http.test.ts`); test cũ của bảng tin, tin đã lưu,
      tin nhắn (cùng dùng con trỏ) vẫn xanh

## 2. Tài liệu

- [x] 2.1 TK 11 dòng "Sắp xếp" + PDF; CLAUDE.md thứ tự change; `docs/VIEC-DANG-DO.md`

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; màn kết quả tìm kiếm có nút sắp xếp (Mới nhất / Giá thấp / Giá cao)
- [x] 3.2 Thử trên máy ảo: đổi cách xếp, thứ tự tin đổi theo

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build` (ghim-server); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-feed-sort` sau khi gộp vào `main`.
