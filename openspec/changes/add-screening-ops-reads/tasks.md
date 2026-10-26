# Tasks

Duyệt 26/10/2026 (người dùng: "Tiến hành" năm màn máy duyệt của bàn vận hành).

## 1. Server

- [x] 1.1 `screening`: repository `keywordsOf`; `lists.service` đọc từ khoá một danh mục, mục danh sách trắng kèm `url`
- [x] 1.2 Route `GET /ops/screening/categories/:categoryId/keywords`
- [x] 1.3 Test: đọc lại từ khoá đã thay, 404 danh mục không có (`screening-rules.http.test.ts`); đường xem mở được ảnh
      nguồn (`screening-images.http.test.ts`)

## 2. `ghim-app`

- [x] 2.1 `npm run api:sync`; bàn vận hành: cụm từ cấm, danh sách trắng ảnh, luật riêng và ngưỡng dải theo danh mục, từ
      khoá danh mục
- [x] 2.2 Thử trên máy ảo với master

## 3. Kiểm tra tích hợp

- [x] 3.1 `pnpm run check`, `pnpm run build` (ghim-server); `npm run check` (ghim-app)

## Workflow follow-up

- Archive bằng `/opsx:archive add-screening-ops-reads` sau khi gộp vào `main`.
