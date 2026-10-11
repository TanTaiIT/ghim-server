# Design

## Context

Đo và đọc mã nguồn ngày 11/10/2026 (Fastify 5.12, `pg-pool`, pg-boss 12, argon2 0.45):

| Chỗ                      | Hiện tại                                                      |
| ------------------------ | ------------------------------------------------------------- |
| `trustProxy`             | `true` — IP lấy địa chỉ ngoài cùng trái của `X-Forwarded-For` |
| `requestTimeout`         | 0 (không giới hạn), mặc định của Fastify                      |
| Chờ kết nối từ pool `pg` | không giới hạn (`connectionTimeoutMillis` không đặt)          |
| `statement_timeout`      | không đặt                                                     |
| Pool Prisma / pg-boss    | 10 / 10 mỗi tiến trình, không chỉnh được                      |
| argon2                   | mặc định 64 MiB, 3 vòng, 4 luồng; thread pool Node 4 luồng    |
| `outbox_events` đã phát  | giữ mãi                                                       |
| Tắt server               | `dispatcher.stop()` không chờ lượt đang chạy                  |
| `x-request-id` từ ngoài  | nhận nguyên văn, trả lại trong header và ghi vào log          |
| Source map               | có trong `dist/`, nhưng node chạy không bật                   |

## Goals / Non-Goals

**Goals**: không có giá trị nào trong bảng trên còn là "không giới hạn" hay "tin mọi thứ"; không mã lỗi mới, không
migration, không package mới.

**Non-Goals**: các mục "cố ý chưa làm" của proposal; `handlerTimeout` của Fastify (trả 503 theo định dạng riêng của
Fastify — một hợp đồng lỗi mới cho client; trần ở phía DB đã chặn được thời gian xử lý vì handler của Ghim là việc DB).

## Decisions

### 1. `TRUST_PROXY`

Env nhận `false` (không proxy) hoặc danh sách IP / CIDR / dải đặt tên của `proxy-addr` (`loopback`,
`linklocal`, `uniquelocal` — mạng nội bộ) phân tách bằng dấu phẩy. Bị từ chối ở mọi môi trường:

- `true` — tin mọi proxy, client tự đặt `X-Forwarded-For` là giả được IP.
- **Số hop** — bản đầu của design này định nhận `TRUST_PROXY=1`; lúc code phát hiện Fastify 5.12 cố ý không tin
  số hop ("không kiểm được máy nối trực tiếp — client nối thẳng khai đủ hop là giả được"), tức `1` sẽ làm mọi
  request mang IP của proxy. Chỉ danh sách địa chỉ kiểm được người nối vào đúng là proxy.

Production không có mặc định — thiếu là không khởi động (spec environment-guard), vì cả hai mặc định đều nguy
hiểm: tin mọi proxy cho client giả IP, `false` sau proxy làm mọi người dùng chung một IP và chung một trần rate
limit. Dev / test mặc định `false`. Giá trị đã parse đi thẳng vào option `trustProxy` của Fastify (kiểu
`false | string[]`, khớp kiểu Fastify khai).

### 2. CORS production

`env.ts` từ chối `CORS_ORIGIN=*` khi `NODE_ENV=production`, cùng chỗ với `SMTP_URL` và `GOOGLE_CLIENT_IDS`.

### 3. Timeout và pool

| Chỗ                                        | Giá trị | Nằm ở                    |
| ------------------------------------------ | ------- | ------------------------ |
| `requestTimeout` của Fastify               | 30 giây | hằng số, `app.ts`        |
| `connectionTimeoutMillis` của pool `pg`    | 5 giây  | hằng số, `lib/prisma.ts` |
| `statement_timeout` của mỗi kết nối Prisma | 15 giây | hằng số, `lib/prisma.ts` |
| `max` của pool `pg` dưới Prisma            | 10      | env `DATABASE_POOL_MAX`  |
| `max` của pool pg-boss                     | 5       | env `JOBS_POOL_MAX`      |

Chỉ pool vào env: đó là con số phụ thuộc số tiến trình và `max_connections` của từng nơi triển khai. Ba trần thời
gian là hằng số — bản đầu của design này đưa cả ba vào env, nhưng chưa có nơi nào cần giá trị khác, và một biến env
là một thứ phải ghi tài liệu, test và giữ đồng bộ ở mọi môi trường. Cần chỉnh thì sửa hằng số.

Tổng kết nối một tiến trình = `DATABASE_POOL_MAX + JOBS_POOL_MAX`; nhân số tiến trình phải dưới `max_connections` của
Postgres trừ phần cho migration và người vận hành — ghi trong README. Migration chạy bằng Prisma CLI với kết nối riêng
nên không chịu `statement_timeout`. Chạm trần thì Prisma / `pg` ném lỗi không có trong bảng ánh xạ, `errorHandler` trả
500 `INTERNAL_ERROR` như mọi lỗi lạ.

### 4. argon2 giữ mặc định

Bản đầu của design này hạ tham số argon2 xuống mức OWASP 19 MiB và đặt `UV_THREADPOOL_SIZE=8` — bỏ lại vì chưa đo
được nghẽn nào: tham số mặc định của thư viện mạnh hơn mức OWASP, và chuỗi băm tự mang tham số nên chỉnh sau không phải
chuyển đổi gì. Chỉnh khi có số đo tải đăng nhập.

### 5. Dọn outbox

`src/common/outbox/outbox.jobs.ts`: việc `outbox.purge-published` lúc 04:30 hằng ngày (Asia/Ho_Chi_Minh) xoá
`outbox_events` có `published_at` quá 30 ngày. Sự kiện chưa phát (`published_at IS NULL`) không bao giờ bị xoá —
luật "không bỏ sự kiện" giữ nguyên. 30 ngày là hằng hạ tầng (tra lại sự kiện khi điều tra một sự cố), không phải con
số TK 28. Việc này nối vào app qua một định nghĩa module hạ tầng `outbox` không có route (`AppModule.routes` thành tuỳ
chọn); `ops` (đợt 7) nhận lại.

### 6. Tắt êm

`OutboxDispatcher.stop()` trả `Promise<void>`: dừng hẹn giờ rồi chờ lượt `runOnce` đang chạy (nếu có) xong. `server.ts`
`await` nó trước `jobs.stop()` và `prisma.$disconnect()`.

### 7. Mã truy vết

`genReqId` chỉ nhận `x-request-id` khớp `^[A-Za-z0-9._:-]{1,128}$`, ngược lại sinh UUID (spec api-contract).

### 8. Source map

`Dockerfile` và script `start` chạy `node --enable-source-maps dist/server.js`.

### Mã lỗi mới

_(không có)_

### Dữ liệu

Không đổi bảng, không migration.

## Risks / Trade-offs

- [Production quên khai `TRUST_PROXY` hoặc `CORS_ORIGIN`] → Không khởi động, lỗi nêu đúng tên biến; `.env.production.example`
  ghi giá trị điển hình (`TRUST_PROXY=uniquelocal` sau reverse proxy trong mạng nội bộ).
- [`statement_timeout` 15 giây cắt một truy vấn hợp lệ nhưng chậm] → Sửa hằng số; truy vấn của Ghim hiện dưới 100 ms.

## Migration Plan

Triển khai code; khai `TRUST_PROXY` và `CORS_ORIGIN` ở production trước. Không có thay đổi dữ liệu. Lùi: revert code.

## Open Questions

_(không có)_
