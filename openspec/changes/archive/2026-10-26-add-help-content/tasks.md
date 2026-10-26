# Tasks

Duyệt 25/10/2026 (người dùng chọn "Master trên bàn vận hành").

## 1. Server

- [x] 1.1 `schema.prisma` model `HelpTopic` + migration `add_help_content` (nạp sẵn bốn chủ đề, đã sửa cho khớp TK)
- [x] 1.2 `platform` repository: đọc, thêm (đứng cuối), sửa, xoá, sắp lại — ghi nhật ký cùng transaction
- [x] 1.3 Cụm `platform/help/`: service + route `GET /help/topics`, `/ops/help/*` (master)
- [x] 1.4 Test HTTP mọi scenario của `platform/help-content` (`help-content.http.test.ts`)

## 2. Tài liệu

- [x] 2.1 TK 6 bảng quyền, TK 24 đoạn "Trợ giúp" + PDF; CLAUDE.md thứ tự change

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; màn trợ giúp đọc server, bỏ `mock.ts` / `mock-data.ts`; bàn vận hành → "Trợ giúp" (master):
      thêm, sửa, xoá, sắp xếp chủ đề
- [x] 3.2 Thử trên máy ảo: master sửa một câu trả lời → người dùng thấy câu mới ở màn trợ giúp

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` (ghim-server); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-help-content` sau khi gộp vào `main`, sau `add-screening-stats`.
