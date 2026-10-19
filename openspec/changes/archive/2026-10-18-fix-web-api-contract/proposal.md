# Proposal

## Why

Hai lỗi ở hợp đồng HTTP, lộ ra khi nối app Ghim (`ghim-app`) với server ngày 18/10/2026. Cả hai chặn client thật,
không phải chi tiết tài liệu:

1. **CORS chỉ mở `GET`, `HEAD`, `POST`.** Đăng ký CORS không khai phương thức nên dùng mặc định của thư viện, và
   trình duyệt chặn ngay ở bước preflight mọi `PATCH`, `PUT`, `DELETE`: lưu nháp, sửa tin, xoá nháp, và gần như mọi
   thao tác ghi của bàn vận hành (sửa danh mục, đổi cài đặt, soạn và phát hành mẫu). TK 2: bàn vận hành **là một
   trang web** — lỗi này chặn đúng một trong hai cửa vào hệ thống. App trên điện thoại không gặp (không có CORS), còn
   bản web của app chết ở bước lưu tin. Đo được: preflight `PATCH /api/v1/listings/{id}` từ một origin được phép trả
   `access-control-allow-methods: GET,HEAD,POST`, request thật không được gửi đi.
2. **Route "khách xem được, có phiên thì thấy thêm" không khai cách xác thực trong tài liệu API.** Năm route đọc tin
   (`GET /listings`, `/listings/:id`, `/listings/:id/suggestions`, `/groups/:groupId/listings`,
   `/users/:id/listings`) nhận phiên tuỳ chọn nhưng tài liệu không nói gì về xác thực, nên client sinh từ tài liệu
   (SDK của app) gọi ẩn danh cả khi người dùng đã đăng nhập. Hệ quả: chủ tin mở nháp của chính mình nhận 404, và
   thành viên không thấy tin "chỉ thành viên" của nhóm mình — mức hiển thị theo người xem (TK 9, TK 15) mất tác dụng
   với mọi client sinh từ tài liệu. `GET /groups/:groupId` đã khai đúng (không phiên hoặc Bearer); năm route kia thì
   chưa. App đang vá bằng cách tự xin Bearer ở từng lượt gọi — vá ở client là sai chỗ: bàn vận hành và client sau
   này sẽ gặp lại.

Không thuộc đợt nào của TK 29: sửa lỗi hạ tầng trước tính năng kế, như các change sửa lỗi rà soát.

## What Changes

- CORS cho phép đủ các phương thức API đang dùng — `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE` — với mọi origin
  được phép. Cách khai origin (`CORS_ORIGIN`) và luật cookie đi kèm giữ nguyên.
- Năm route đọc tin trên khai trong tài liệu: gọi không phiên hoặc kèm Bearer — giống `GET /groups/:groupId`.
- `http/api-contract` thêm hai requirement: trình duyệt ở origin được phép gọi được mọi phương thức của API; tài
  liệu khai đúng cách xác thực của từng route (bắt buộc, tuỳ chọn, không cần).

**Cố ý chưa làm**:

- Không đổi luật origin: dev vẫn mở cho mọi nguồn, production vẫn bắt buộc danh sách cụ thể.
- Không mở cho trình duyệt đọc header nào thêm (vd `x-request-id`) — chưa client nào cần.
- Không gom các khai báo Bearer đang lặp ở nhiều file route.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `http/api-contract`: thêm "Trình duyệt gọi được mọi phương thức của API" và "Tài liệu khai cách xác thực của từng
  route".

## Impact

- **Code**: `src/app.ts` (đăng ký CORS), `src/modules/listing/read/read.routes.ts` (khai xác thực cho năm route).
- **Client**: sinh lại SDK (`ghim-app`: `npm run api:sync`) thì năm route tự kèm Bearer; app bỏ được chỗ tự xin Bearer
  (`VIEWER` trong `src/api/client.ts`) — việc của repo app, không thuộc change này.
- **Migration**: không.
- **Test**: test HTTP qua `app.inject` — preflight từng phương thức, và tài liệu `/docs/json` của năm route.
