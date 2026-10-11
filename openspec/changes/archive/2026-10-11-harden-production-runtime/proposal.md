# Proposal

## Why

Rà soát mức sẵn sàng production ngày 11/10/2026 (kỹ thuật, không bàn nghiệp vụ) tìm ra tám chỗ ở tầng chạy thật.
Bốn chỗ là rủi ro thật khi mở cổng cho người dùng: server tin mọi proxy (client tự đặt `X-Forwarded-For` để lách
trần gọi route đăng nhập và ghi IP giả vào phiên), không có timeout nào (vài truy vấn treo là giữ chặt pool và cả app
đứng), pool kết nối để mặc định không chỉnh được, và CORS `*` vẫn được chấp nhận ở production. Bốn chỗ còn lại làm
app khó vận hành: bảng outbox không bao giờ được dọn, tắt server không chờ lượt phát outbox đang chạy, mã truy vết từ
ngoài được nhận nguyên văn, và stack trace production trỏ vào mã đã biên dịch.

TK 26 (việc hệ thống tự làm phải chạy được dù một bước lỗi) và TK 30 (phụ lục cho đội lập trình). Đợt: hạ tầng giữa
đợt 1, trước `add-groups` (TK 29).

## What Changes

- **Proxy tường minh**: `TRUST_PROXY` (danh sách IP / dải mạng của proxy thật) thay `trustProxy: true`.
  Production bắt buộc khai; "tin mọi proxy" và số hop bị từ chối ở mọi môi trường (Fastify 5.12 không tin số hop).
- **CORS production**: `CORS_ORIGIN=*` (hay bỏ trống) ở production thì app từ chối khởi động.
- **Timeout**: thời gian nhận request từ client có trần; lấy kết nối DB có trần; mỗi câu SQL có `statement_timeout`
  — ba hằng số trong code. Chạm trần thì request rơi vào lỗi 500 `INTERNAL_ERROR` sẵn có — không thêm mã lỗi mới.
- **Pool kết nối** chỉnh được qua env, cho cả Prisma lẫn pg-boss; tài liệu ghi cách tính tổng theo số tiến trình.
- **Dọn outbox**: việc hằng ngày xoá sự kiện đã phát quá 30 ngày; sự kiện chưa phát không bao giờ bị xoá.
- **Tắt êm**: tắt server chờ lượt phát outbox đang chạy xong rồi mới đóng DB.
- **Mã truy vết**: `x-request-id` từ ngoài chỉ được giữ khi dài tối đa 128 ký tự trong bộ `A–Z a–z 0–9 . _ : -`;
  sai định dạng thì server tự sinh UUID mới.
- **Source map**: production chạy với `--enable-source-maps`.

**Cố ý chưa làm** (chờ chốt hạ tầng triển khai): kho đếm rate limit dùng chung nhiều tiến trình; nén response (dựa
vào reverse proxy / CDN, nếu không có thì cần package `@fastify/compress` — hỏi trước); gộp log mỗi request thành một
dòng; phiên bản khoá cho `SECRETS_ENCRYPTION_KEY`.

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `runtime/environment-guard`: thêm requirement "Production đòi cấu hình mạng tường minh" (CORS, proxy).
- `http/api-contract`: sửa requirement "Mã truy vết request" (chỉ giữ mã đúng định dạng).

## Impact

- `src/config/env.ts`, `src/app.ts`, `src/lib/prisma.ts`, `src/lib/jobs.ts`, `src/server.ts`,
  `src/common/outbox/*`, `src/common/module/app-module.ts`, `Dockerfile`, `package.json`,
  `.env.*.example`.
- Không migration, không thêm package, không đổi API ngoài định dạng mã truy vết.
- Vận hành: production phải khai `TRUST_PROXY` và `CORS_ORIGIN`; có thể chỉnh pool qua env.
