# Tasks

Duyệt 24/10/2026 — ba câu hỏi sản phẩm chốt cùng ngày (proposal, mục **Đã chốt**).

## 1. Server

- [x] 1.1 `listing.schema` `feedQuerySchema` thêm `attrs` (chuỗi JSON → object tên mục → mảng 1–20 chuỗi hoặc
      `{ min?, max? }`, ít nhất một đầu, `min ≤ max`); JSON hỏng → 400 `VALIDATION_ERROR` (design mục 1)
- [x] 1.2 `calc/attribute-filter.calc.ts`: kiểm bộ lọc theo mẫu (design mục 2) và dựng điều kiện Prisma (design mục 3).
      Unit test: mỗi kiểu mục, mục chữ, mục không có, giá trị ngoài lựa chọn, kiểu bộ lọc sai kiểu mục, nhiều mục ghép AND
- [x] 1.3 `read.service.feed`: `attrs` mà thiếu `categoryId` → 400; có thì đọc `currentTemplate` qua cổng của `category`,
      ghép điều kiện vào `filters`; Swagger mô tả `attrs` kèm ví dụ
- [x] 1.4 Test HTTP mọi scenario của delta `listing/visibility` (`tests/listing-filters.http.test.ts`; unit `tests/attribute-filter.calc.test.ts`) (tin dựng với `attributes` thật qua mẫu danh mục đã phát
      hành, kể cả tin theo mẫu cũ thiếu mục)

## 2. Tài liệu

- [x] 2.1 TK 11: cách lọc từng kiểu mục, mục chữ không lọc, tin thiếu mục không hiện; sinh lại PDF. CLAUDE.md thứ tự change;
      `docs/VIEC-DANG-DO.md` mục 8 bỏ dòng "lọc theo mẫu thông tin"

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; `SearchFilters` thêm `attrs`, `client.searchListings` gửi `attrs` khi có
- [x] 3.2 `SearchFilterBar`: nút "Thông tin" khi đã chọn danh mục, bảng chọn theo mẫu (design mục 5); đổi danh mục thì xoá
      bộ lọc; xác minh `npm run typecheck`, `npm run lint`, `npm test`
- [x] 3.3 Thử trên hai máy ảo: lọc hãng, lọc khoảng số, tin thiếu mục không hiện, đổi danh mục xoá bộ lọc

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run format:check`, `pnpm run build` (ghim-server)

## Workflow follow-up

- Archive bằng `/opsx:archive add-listing-filters` sau khi gộp vào `main`.
