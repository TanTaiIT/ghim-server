# Tasks

Nhóm 1 không đổi hành vi nào có spec — làm ngay. Nhóm 2 sửa spec đã archive — làm sau khi người dùng duyệt delta.

## 1. Không đổi hành vi

- [x] 1.1 Env `DATABASE_POOL_MAX`, `JOBS_POOL_MAX` (có mặc định) cho pool `pg` dưới Prisma và pool pg-boss; hằng số `requestTimeout` 30 giây, chờ kết nối 5 giây, `statement_timeout` 15 giây; xác minh unit test env (mặc định, giá trị sai bị từ chối) và test DB: client của app chạy với `statement_timeout` 15 giây, câu SQL vượt trần bị huỷ
- [x] 1.2 argon2 giữ tham số mặc định (bỏ phần hạ tham số và `UV_THREADPOOL_SIZE` của bản đầu — chưa đo được nghẽn)
- [x] 1.3 `outbox.purge-published` (04:30, giữ 30 ngày, không đụng sự kiện chưa phát) qua module hạ tầng `outbox`, `AppModule.routes` thành tuỳ chọn; xác minh test DB: chỉ xoá sự kiện đã phát quá hạn
- [x] 1.4 `OutboxDispatcher.stop()` chờ lượt đang chạy; `server.ts` `await`; xác minh test DB: `stop()` chỉ xong sau khi bên nghe đang chạy xong
- [x] 1.5 `--enable-source-maps` trong `Dockerfile` và script `start`

## 2. Sửa spec đã archive (chờ duyệt)

- [x] 2.1 `TRUST_PROXY` (false / danh sách IP-CIDR-dải đặt tên; `true` và số hop bị từ chối; production bắt buộc) nối vào `trustProxy`; `CORS_ORIGIN=*` bị từ chối ở production; xác minh unit test env năm scenario của requirement mới, test Fastify thật: proxy được khai thì lấy IP từ `X-Forwarded-For`, người nối không phải proxy thì bỏ qua, và test HTTP của app: `X-Forwarded-For` giả không đổi được IP khi `TRUST_PROXY=false`
- [x] 2.2 `genReqId` chỉ nhận mã đúng định dạng; xác minh `tests/app.test.ts` bốn scenario của requirement "Mã truy vết request"

## 3. Tài liệu

- [x] 3.1 `.env.*.example`, README (cách tính tổng kết nối, khai `TRUST_PROXY` / `CORS_ORIGIN` ở production), CLAUDE.md (mục Môi trường, luật 12 về dọn outbox), `tests/README.md`; xác minh `pnpm run format:check`

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm test:db`, `pnpm db:drift`, `pnpm run build` xanh; bản build khởi động với env dev

## Workflow follow-up

- Archive sau khi người dùng duyệt kết quả, rồi `pnpm exec prettier --write openspec` và `pnpm run spec:validate`.
