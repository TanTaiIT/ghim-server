# Tasks

## 1. CORS đủ phương thức

- [x] 1.1 `src/app.ts`: đăng ký CORS khai `methods` = `GET, HEAD, POST, PUT, PATCH, DELETE` (design quyết định 1), giữ
      nguyên `origin`, `credentials` và chế độ phản chiếu header; sửa comment đi kèm cho đúng
- [x] 1.2 `tests/app.test.ts` "Hạ tầng HTTP": với mọi phương thức có trong `/docs/json` (gồm `PATCH`, `PUT`,
      `DELETE`), preflight `OPTIONS /api/v1/listings/<id>` kèm `authorization, content-type, x-device-id` → 204,
      `access-control-allow-methods` có phương thức đó, allow-headers có cả ba (scenario "Lưu nháp từ trình duyệt",
      "Thao tác ghi của bàn vận hành"). Đọc từ tài liệu nên route dùng phương thức mới làm ca này đỏ. Xác minh: test đỏ
      trước bước 1.1, xanh sau
- [x] 1.3 Cùng file, app production theo mẫu của ca "production: /docs không tồn tại" (`CORS_ORIGIN` =
      `https://ops.ghim.vn`): preflight từ `https://ops.ghim.vn` xin `PATCH` → được phép, có
      `access-control-allow-credentials: true`; từ `https://evil.example` → không có `access-control-allow-origin`
      (scenario "Origin không được phép")
- [x] 1.4 CLAUDE.md dòng `@fastify/cors` (mục hạ tầng): ghi CORS mở đủ sáu phương thức API, thêm phương thức mới phải
      sửa danh sách — test 1.2 giữ cửa

## 2. Tài liệu khai xác thực cho route phiên tuỳ chọn

- [x] 2.1 `src/modules/listing/read/read.routes.ts`: thêm `optionalBearer = [{}, ...bearer]` theo mẫu
      `group.routes.ts`, gắn `security: optionalBearer` cho năm route dùng `anyone` (bảng tin, xem một tin, tin tương
      tự, tin trong nhóm, tin của người bán). Xác minh: `grep -c "security: optionalBearer"` trong file = 5
- [x] 2.2 Test tài liệu: ca "đủ 15 route tin đăng" của `tests/listing-lifecycle.http.test.ts` đang chốt hợp đồng cũ
      (route đọc không khai gì) — sửa thành năm path có `security` = `[{}, { bearerAuth: [] }]`, `GET /me/listings` và
      mọi route ghi = `[{ bearerAuth: [] }]`; `GET /categories` không có `security` đã có ở ca "Swagger" của
      `tests/category.http.test.ts` (ba scenario tài liệu). Xác minh: đỏ trước 2.1, xanh sau
- [x] 2.3 `tests/listing-drafts.http.test.ts` ca "người khác mở hoặc sửa nháp": thêm khách không kèm phiên mở nháp →
      404 `NOT_FOUND` (scenario "Mở nháp của người khác hay không kèm phiên"). Ca chủ tin mở nháp kèm phiên → 200 và
      khách đọc tin đang hiển thị → 200 đã có sẵn (`getOwn`; `tests/listing-visibility.http.test.ts` ca "tin sàn
      chung hết hạn hay đã bán: 200 qua đường link") — chỉ xác nhận chúng vẫn xanh, không viết lại
- [x] 2.4 CLAUDE.md mục `http/api-contract` (danh sách capability): thêm hai requirement mới của change này

## 3. Kiểm tra tích hợp

- [x] 3.1 `pnpm run check` (gồm test DB, Docker ở máy này), `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
      (kỳ vọng: không lệch — change không có migration)

## Workflow follow-up

- Archive change sau khi apply xong và người dùng duyệt; ghi một dòng vào `docs/VIEC-DANG-DO.md`.
- Repo `ghim-app`: `npm run api:sync`, kiểm năm hàm SDK đã kèm `security`, rồi gỡ `VIEWER` trong `src/api/client.ts`.
