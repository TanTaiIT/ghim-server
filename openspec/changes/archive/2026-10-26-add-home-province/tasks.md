# Tasks

Duyệt 25/10/2026 (người dùng chọn "Tỉnh/thành riêng tư").

## 1. Server

- [x] 1.1 `schema.prisma` cột `Account.homeProvinceCode` (FK `provinces`, `SET NULL`) + migration `add_home_province`;
      xoá tài khoản đặt null
- [x] 1.2 `identity`: `PATCH /me` nhận `homeProvinceCode`, kiểm qua cổng `region`; hồ sơ của tôi trả; `app.ts` dựng
      `region` trước `identity`
- [x] 1.3 Test HTTP mọi scenario của "Tỉnh/thành của tôi" (`profile.http.test.ts`)

## 2. Tài liệu

- [x] 2.1 TK 11 dòng "Khu vực" + PDF; CLAUDE.md thứ tự change; `docs/VIEC-DANG-DO.md`

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; Cài đặt → "Khu vực của tôi"; "Gần bạn" và ô tìm kiếm ở trang chủ theo tỉnh đã chọn
- [x] 3.2 Thử trên máy ảo: chọn tỉnh → "Gần bạn" chỉ còn tin của tỉnh đó; bỏ chọn → toàn quốc

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` (ghim-server); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-home-province` sau khi gộp vào `main`, sau `add-feed-sort`.
