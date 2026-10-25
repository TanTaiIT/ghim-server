# Tasks

Duyệt 25/10/2026 (người dùng chọn "Trạng thái giấy tờ CCCD").

## 1. Server

- [x] 1.1 `identity` repository: hồ sơ nộp gần nhất của một tài khoản, thay hàm tìm hồ sơ đang chờ (luật 409 khi đang
      chờ đọc trạng thái của hồ sơ gần nhất); mặt service tài khoản `myIdVerification`; route `GET /me/id-verification`
- [x] 1.2 Test HTTP mọi scenario của "Người nộp xem được hồ sơ của mình" (`id-verification.http.test.ts`)

## 2. Tài liệu

- [x] 2.1 TK 7 đoạn "Xác minh giấy tờ" + PDF; CLAUDE.md thứ tự change

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; màn xác minh đọc trạng thái — chờ duyệt / đã xác minh hiện trạng thái thay form, bị từ chối
      hiện lý do kèm form nộp lại
- [x] 3.2 Thử trên máy ảo: nộp → chờ duyệt; master từ chối kèm lý do → người nộp thấy lý do, nộp lại được

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` (ghim-server); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-id-verification-status` sau khi gộp vào `main`, sau `add-saved-listings`.
