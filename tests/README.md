# Test

| Loại           | File                     | Chạm DB | Câu hỏi nó trả lời                                                                                                                        |
| -------------- | ------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Đơn vị — env   | `env.test.ts`            | không   | App có chết ngay khi thiếu cấu hình, hoặc tên DB không khớp môi trường                                                                    |
| HTTP — hạ tầng | `app.test.ts`            | không   | Vỏ response, 404 cùng vỏ, `x-request-id` giữ nguyên / tự sinh, helmet                                                                     |
| HTTP — lỗi     | `error-handler.test.ts`  | không   | AppError giữ mã riêng; Prisma P2002 / P2025 / P2003; P2039 theo SQLSTATE; validate → 400; sai schema response → 500; nuốt chi tiết lỗi lạ |
| HTTP — giá     | `money.test.ts`          | không   | Giá number ↔ bigint hai chiều, 0 hợp lệ, âm / lẻ / chuỗi → 400, vượt số an toàn → 500                                                     |
| Đơn vị         | `pagination.test.ts`     | không   | Mặc định trang đầu, ép kiểu query, trần `limit`, skip/take, tổng số trang                                                                 |
| Đơn vị         | `health.service.test.ts` | không   | Liveness trả ok                                                                                                                           |
| **DB**         | `health.db.test.ts`      | **có**  | Đường ống `pnpm test:db` thông: migrate deploy chạy, nối được DB `_test`                                                                  |

`pnpm test` chạy mọi file trừ `*.db.test.ts`: không cần Docker, xong trong vài giây.

## Test chạm DB (`pnpm test:db`)

- Local: `pnpm db:test:up` (container `postgres-test`, cổng 5436, tmpfs — tắt là mất sạch).
- CI: job `db` trong `.github/workflows/ci.yml`, chạy thêm `pnpm db:drift`.
- `tests/db-global-setup.ts` áp migration bằng `migrate deploy` (đúng các file SQL viết tay, không
  `db push`). Mỗi ca gọi `truncateAll()` trước khi chạy. File chạy tuần tự.
- DB phải tên `…_test` — setup và `env.ts` từ chối DB khác.
- DB test lệch migration (vd vừa đổi nhánh): `docker compose rm -sf postgres-test && pnpm db:test:up`.

Repository giả KHÔNG thay được test DB: nó mô phỏng thành công, còn cái cần kiểm là DB TỪ CHỐI
đúng lúc nào (vd hai người duyệt cùng mở việc cho một tin).
