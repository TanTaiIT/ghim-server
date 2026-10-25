# Tasks

Duyệt 25/10/2026 (người dùng: "Tiến hành sửa tận gốc giúp tôi").

## 1. Server

- [x] 1.1 `schema.prisma` model `SavedListing` (design mục 1) + migration `add_saved_listings`; test DB: khoá chính
      chặn hai dòng cùng cặp, khoá ngoại xoá theo tin xoá cứng
- [x] 1.2 `listing` repository: lưu (bỏ qua khi đã có), bỏ lưu, trang theo con trỏ có lọc hiển thị, mọi mã, xoá theo
      tài khoản
- [x] 1.3 Cụm `read`: `save`, `unsave`, `saved`, `savedIds`; listener `identity.account.deleted` bỏ tin đã lưu
- [x] 1.4 Route `PUT` / `DELETE /me/saved-listings/:listingId`, `GET /me/saved-listings`, `GET /me/saved-listings/ids`
- [x] 1.5 Test HTTP mọi scenario của spec `listing/saved-listings` (`tests/saved-listings.http.test.ts`)

## 2. Tài liệu

- [x] 2.1 TK 15 đoạn "Tin đã lưu" + bảng mức hiển thị, TK 29 gỡ mục hoãn, PDF; CLAUDE.md thứ tự change; `docs/VIEC-DANG-DO.md`

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; `api.getSavedIds`, `setSaved`, `getSavedListings` gọi server; bỏ dữ liệu mẫu tin đăng
      không còn ai dùng (nhánh tin mẫu ở màn chi tiết, tin tương tự)
- [x] 3.2 Thử trên máy ảo: lưu từ thẻ và từ màn chi tiết, mục "Đã lưu" có tin, "Xem trang" người bán mở được, bỏ lưu

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` (ghim-server); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-saved-listings` sau khi gộp vào `main`.
