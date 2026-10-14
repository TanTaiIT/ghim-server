# Tasks

**Đã duyệt 14/10/2026** theo yêu cầu trực tiếp của người dùng ("lấy key của market apply cho code hiện tại"), theo
`design.md`.

## 1. Cổng kho và cấu hình

- [x] 1.1 `STORAGE_URL` nhận dạng `cloudinary://<api_key>:<api_secret>@<cloud_name>?folder=…` (mặc định `ghim-server`)
      bên cạnh `http(s)://`; cổng `Storage` có `kind`, quyền tải có `method` và `fields`; bộ nối S3 giữ hành vi cũ; xác minh `tests/storage.test.ts` (tách URL, kho RustFS) và unit test cách đọc URL Cloudinary
- [x] 1.2 Bộ nối Cloudinary (design mục 2, 3): chữ ký tải lên và đường xem, `head`, `read` có trần, `copy`,
      `deleteMany` kèm `invalidate`, `list` theo con trỏ, `ensureBucket` = `ping`; không thêm thư viện; xác minh unit
      test chữ ký (bộ thử của Cloudinary) và cách dựng biểu mẫu, đường xem

## 2. `media`

- [x] 2.1 Quyền tải trả `method` / `url` / `headers` / `fields` / `expiresAt`; xác nhận ảnh giữ việc so cỡ và loại
      trong kho (design mục 4); xác minh test HTTP của `media` trên RustFS
- [x] 2.2 `docs/media.md`: app làm theo `upload.method` (PUT thân tệp / POST biểu mẫu + `file`), đường xem khi kho là
      Cloudinary không hết hạn; xác minh `pnpm run format:check`

## 3. Kiểm kho thật và cấu hình

- [x] 3.1 Kiểm bộ nối trên Cloudinary thật bằng script tạm (không commit): tải lên bằng quyền tải, tải lại không đổi
      ruột, tệp không phải ảnh và chữ ký quá giờ bị từ chối, đường xem mở được đúng ruột, đọc có trần, chép, liệt kê
      theo trang, xoá — dọn sạch thư mục thử
- [x] 3.2 `.env.production` (thư mục `ghim-server`) và `.env.development` (thư mục `ghim-server-dev`) trỏ Cloudinary
      bằng khoá của `docs/market`; `.env.production.example`, README, CLAUDE.md, `env.ts` ghi Cloudinary dùng tạm, R2 về
      sau; xác minh server dev khởi động được với kho Cloudinary

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build`, `pnpm db:drift` xanh
