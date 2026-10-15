# Design

> **Đã duyệt 14/10/2026** theo yêu cầu trực tiếp của người dùng: dùng Cloudinary của `docs/market`, chỉ lo lưu và xem
> ảnh, chấp nhận đường xem không hết hạn tới khi chuyển R2.

## Context

- `media` sở hữu ảnh; mọi thao tác với kho đi qua cổng `Storage` (`src/lib/storage.ts`): ký quyền tải, ký đường xem,
  `head`, `read` (máy duyệt băm ảnh), `copy` (tin chuyển lên sàn chung), `deleteMany`, `list` (đối chiếu kho hằng
  tháng), `ensureBucket`. Khoá ảnh là `img/<mã ảnh>`.
- Thử Cloudinary thật ngày 14/10/2026 (thư mục thử đã dọn): tải lên có ký với `public_id` cố định, `overwrite=false`,
  `type=authenticated` → 200; tải lại cùng `public_id` → 200 `existing: true`, cùng version, ruột giữ nguyên; đường xem
  có ký → 200, không ký → 401, bỏ version vẫn 200; `Range` → 206; Admin API chi tiết → cỡ, định dạng, giờ tạo, 404 khi
  không có; liệt kê theo prefix xếp theo `public_id`, sang trang bằng `next_cursor`; chép bằng tải lên từ URL → 200;
  chữ ký ký 2 giờ trước → 400 (Cloudinary nhận chữ ký trong 1 giờ); xoá xong CDN vẫn trả ảnh cũ nếu không kèm
  `invalidate`.

## Decisions

### 1. Hai bộ nối, chọn theo `STORAGE_URL`

| `STORAGE_URL`                                                       | Bộ nối     | Dùng                      |
| ------------------------------------------------------------------- | ---------- | ------------------------- |
| `http(s)://<key>:<secret>@<host>/<bucket>[?region=…]`               | chuẩn S3   | RustFS dev / test, R2 sau |
| `cloudinary://<api_key>:<api_secret>@<cloud_name>?folder=<thư mục>` | Cloudinary | production tạm thời       |

Dạng `cloudinary://` là dạng `CLOUDINARY_URL` của chính Cloudinary, thêm `folder`. Thư mục mặc định `ghim-server`:
`public_id` = `<folder>/img/<mã ảnh>`, tách khỏi ảnh của `docs/market` trên cùng tài khoản. Cổng `Storage` có thêm
`kind` (`s3` / `cloudinary`) để công cụ kiểm biết chờ gì; module không rẽ nhánh theo nó.

### 2. Ánh xạ từng thao tác sang Cloudinary

| Thao tác       | Cloudinary                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quyền tải      | `POST https://api.cloudinary.com/v1_1/<cloud>/image/upload`, trường ký: `public_id`, `overwrite=false`, `type=authenticated`, `allowed_formats=jpg,png,webp`, `timestamp`; kèm `api_key`, `signature`; app thêm `file` |
| `head`         | Admin API chi tiết ảnh → cỡ, định dạng (`jpg`→`image/jpeg`…), giờ tạo; 404 → `null`                                                                                                                                    |
| đường xem      | `res.cloudinary.com/<cloud>/image/authenticated/s--<chữ ký 8 ký tự>--/<public_id>` — không hết hạn                                                                                                                     |
| `read`         | tải đường xem kèm `Range: bytes=0-<trần>`; quá trần thì ném; 404 → `null`                                                                                                                                              |
| `copy`         | tải lên có ký với `file` = đường xem của ảnh nguồn                                                                                                                                                                     |
| `deleteMany`   | Admin API xoá theo lô 50 `public_id` (mục 7), kèm `invalidate=true` để CDN thôi trả ảnh đã xoá                                                                                                                         |
| `list`         | Admin API liệt kê theo prefix (xếp theo `public_id`), sang trang bằng `next_cursor`                                                                                                                                    |
| `ensureBucket` | Admin API `ping` — Cloudinary không có bucket; khoá sai thì khởi động hỏng ngay                                                                                                                                        |

Chữ ký tải lên: các trường xếp theo chữ cái, `k=v` nối bằng `&`, ghép `api_secret`, SHA-1 hex (như `docs/market`).
Chữ ký đường xem: SHA-1 của `<public_id>` ghép `api_secret`, base64 an toàn cho URL, 8 ký tự đầu.

### 3. Liệt kê "sau khoá X"

Lượt đối chiếu kho đi theo trang xếp theo khoá và tiếp tục "sau khoá cuối" (cổng `list` nhận `after`). Admin API chỉ
có `next_cursor`. Bộ nối nhớ trong bộ nhớ khoá cuối của mỗi trang → con trỏ trang sau, nên các trang liền nhau của
một lượt đi thẳng; `after` chưa từng thấy (lượt tiếp tục sau khi khởi động lại) thì đi lại từ đầu và bỏ qua các khoá
≤ `after`. Chi phí đó đáng với quy mô hiện tại; lên R2 thì `StartAfter` của S3 thay hẳn.

### 4. Chặn ở bước xác nhận ảnh

Kho S3 tự từ chối tải sai cỡ, sai loại, quá 15 phút. Cloudinary không ràng cỡ vào chữ ký (`allowed_formats` chặn loại)
và nhận chữ ký trong 1 giờ. Bước xác nhận ảnh (`media.resolve`) vốn đã so cỡ và loại trong kho với lúc xin — giữ nguyên
và đủ cho Cloudinary: ảnh không qua thì không dùng được ở đâu (400 `IMAGE_NOT_IN_STORAGE`) và bị lượt dọn ảnh chưa xác
nhận xoá như mọi ảnh bỏ dở.

Hạn quyền tải với Cloudinary là 1 giờ chứ không 15 phút. Chặn đúng 15 phút ở bước xác nhận phải so giờ tải của kho với
giờ cấp quyền của app — hai đồng hồ khác nhau, nên phải lưu thêm hạn quyền tải vào DB — để bịt một khe không còn hại:
ảnh không ghi đè được, và quyền tải chỉ cấp cho chính người xin. Người dùng chấp nhận 14/10/2026; R2 trả lại 15 phút.

Tải lại bằng quyền tải đã dùng: Cloudinary trả 200 `existing` nhưng không đổi ruột — điều spec bảo vệ (ruột ảnh không
đổi) vẫn giữ; khác S3 ở chỗ lượt tải lại không bị báo lỗi.

### 5. Quyền tải trả cho app

`upload: { method: 'PUT' | 'POST', url, headers, fields, expiresAt }`. S3: `PUT`, ba header đã ký, `fields` rỗng.
Cloudinary: `POST` multipart, `fields` là các trường đã ký (gửi nguyên văn), tệp ở trường `file` gửi sau cùng,
`headers` rỗng.

### 6. Không thêm thư viện

`fetch` + `node:crypto`, như `docs/market` (`upload.cleanup.service.ts`). Không cần SDK `cloudinary`.

### 7. Kho không trả lời, lô xoá (review 15/10/2026, người dùng duyệt)

- **503 thay vì 500.** Mọi lượt gọi Cloudinary có hạn 15 giây (lệnh nặng nhất là đọc hay chép một ảnh 5 MB). Mất
  mạng, quá giờ (kể cả đứt giữa lúc tải thân), 420 (quá trần lượt gọi của Cloudinary), 429, 5xx → bộ nối ném
  `StorageUnavailableError` (cạnh cổng `Storage`, để bộ nối R2 dùng lại); `errorHandler` dịch thành 503
  `STORAGE_UNAVAILABLE` và ghi log mức warn — như lỗi Prisma, map tập trung chứ không ở service. Lỗi khác của kho (khoá,
  chữ ký sai) vẫn là 500: đó là lỗi cấu hình, cần người sửa. Bước xác nhận ảnh chạy trước transaction lưu chủ và hỏi
  kho trước khi ghi nhãn, nên 503 không để lại gì nửa chừng. Việc nền (máy duyệt đọc ảnh, dọn ảnh) vẫn ném ra để hàng
  việc thử lại như trước.
- **Lô xoá 50.** Admin API nhận tới 100 `public_id` mỗi lệnh nhưng chúng nằm trong query string: lô 100 dài 7,5–7,9 KB
  (đo với `ghim-server` / `ghim-server-dev`), sát trần 8 KB dòng request của nhiều máy chủ, và lần thử kho thật chỉ xoá
  vài ảnh. Lô 50 còn khoảng một nửa.

## Risks / Trade-offs

- **Đường xem không hết hạn** (lệch TK 25, TK 28 `media.viewUrlMinutes`): link lộ ra ngoài thì xem được tới khi ảnh bị
  xoá, kể cả khi người đó đã rời nhóm. Người đã xem được ảnh vốn chụp hay tải ảnh được; chuyển R2 là hết lệch.
- **Trần Admin API của gói Cloudinary**: mỗi ảnh mới tốn một lượt khi xác nhận; dọn ảnh và đối chiếu kho thêm vài lượt.
  Đủ cho giai đoạn chưa mở thật; lên R2 trước khi có lưu lượng thật.
- **Chung tài khoản với `docs/market`**: tách bằng thư mục; khoá API là của cả tài khoản.
- **Ảnh tải lên ngoài giờ hay sai cỡ vẫn nằm trong kho** tới lượt dọn (48 giờ), dù không dùng được.

## Migration Plan

Không đổi DB. Đặt `STORAGE_URL=cloudinary://…` (production thư mục `ghim-server`, dev `ghim-server-dev`); test giữ
RustFS. Về R2: đổi `STORAGE_URL`; ảnh đã lưu trên Cloudinary cần chép sang (chưa có ảnh thật nào ở thời điểm này).
