# Proposal

## Why

Kho ảnh chốt ngày 11/10/2026 là chuẩn S3 — Cloudflare R2 ở production (TK 25). Chưa có R2; thử Backblaze B2 ngày
14/10/2026 thì B2 trả 501 cho `If-None-Match: *`: quyền tải dùng lại được để thay ruột ảnh
sau khi máy đã kiểm — đúng điều spec `media/image-storage` "Ảnh đã tải không bị ghi đè" cấm (TK 25, TK 27 cam kết 4).

Người dùng chốt (14/10/2026): dùng tạm **Cloudinary** — tài khoản đang dùng cho `docs/market` — chỉ cho việc lưu ảnh
và lấy ra xem, rồi chuyển sang R2 sau. Cloudinary giữ được ruột ảnh không đổi (`overwrite=false`), nhưng không ràng cỡ,
loại và hạn 15 phút vào chữ ký như kho S3 — hệ thống phải tự chặn ở bước xác nhận ảnh.

Hạ tầng, không thuộc đợt nào của TK 29.

## What Changes

- Kho ảnh có hai bộ nối sau cùng một cổng: chuẩn S3 (RustFS khi dev / test, R2 về sau) và Cloudinary (production tạm
  thời). `STORAGE_URL` chọn bộ nối: `http(s)://…` là S3, `cloudinary://<api_key>:<api_secret>@<cloud_name>?folder=…`
  là Cloudinary. Đổi về R2 chỉ là đổi biến môi trường.
- Quyền tải có thêm dạng gửi biểu mẫu (`POST` multipart kèm các trường đã ký) bên cạnh dạng `PUT` kèm header — app làm
  theo `method` trong quyền tải.
- Kho Cloudinary không ràng cỡ vào chữ ký: bước xác nhận ảnh (vốn đã so cỡ và loại trong kho) là chỗ chặn. Hạn quyền
  tải với Cloudinary là hạn chữ ký của nó — 1 giờ thay vì 15 phút.

**Cố ý chưa làm**: đường xem ảnh có hạn 60 phút (TK 25, TK 28 `media.viewUrlMinutes`) khi kho là Cloudinary — gói
hiện có không ký được đường xem hết hạn qua CDN. Đường xem vẫn có chữ ký, không đoán được, và chỉ cấp cho người được
xem; chuyển sang R2 là đường xem có hạn quay lại. Người dùng chấp nhận điểm lệch này ngày 14/10/2026.

Không thêm thư viện: chữ ký Cloudinary là SHA-1, Upload API và Admin API gọi bằng `fetch` (như `docs/market`).

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `media/image-storage`: "Giới hạn của một lượt tải" và "Ảnh đã tải không bị ghi đè" — chỗ chặn là kho hoặc bước xác
  nhận ảnh; điều người dùng thấy không đổi: tải sai cỡ, sai loại, quá hạn thì ảnh không dùng được ở đâu, và ảnh đã
  tải không đổi được ruột.

## Impact

- `src/config/storage-url.ts`, `src/lib/storage.ts` (cổng + bộ nối S3), bộ nối Cloudinary mới, `media.service`
  (quyền tải trả nguyên dạng của kho), `media.schema` (quyền tải có `fields`).
- App (`ghim-app`): làm theo `upload.method` — `PUT` gửi thân tệp kèm `headers`, `POST` gửi biểu mẫu gồm `fields` rồi
  tới tệp ở trường `file`. Hướng dẫn ở `docs/media.md`.
- Cấu hình: `.env.production` (thư mục `ghim-server`) và `.env.development` (thư mục `ghim-server-dev`) trỏ Cloudinary,
  riêng với ảnh của `docs/market`. Test giữ RustFS.
- Giới hạn của gói Cloudinary: Admin API (xác nhận ảnh, dọn ảnh, đối chiếu kho) có trần lượt gọi mỗi giờ.
