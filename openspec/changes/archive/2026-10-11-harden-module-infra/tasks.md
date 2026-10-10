# Tasks

## 1. Bộ phát outbox

- [x] 1.1 `schema.prisma`: `outbox_events.next_attempt_at`, `locked_until`, partial index `(next_attempt_at) WHERE published_at IS NULL` thay index cũ; migration `outbox_retry_lease` bằng `migrate dev --create-only`, đọc SQL; xác minh `pnpm db:drift` ra "No difference detected"
- [x] 1.2 `dispatcher.ts`: nhận lô bằng `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING`, hạn giữ 60 giây, thử lại sau `min(10 giây × 2^attempts, 1 giờ)`, `logger.error` từ lần thử thứ 10; xác minh test DB: 100 sự kiện hỏng không chặn sự kiện mới; hai bộ phát chạy cùng lúc không phát trùng; hạn giữ hết thì lô được nhận lại; sự kiện hỏng được thử lại sau giờ hẹn
- [x] 1.3 CLAUDE.md luật 12: hợp đồng bên nghe thêm "không dựa vào thứ tự", cách phát lại tay một sự kiện kẹt; xác minh `pnpm run format:check`

## 2. Bản giả khớp bản thật

- [x] 2.1 `uniqueViolation(target)` tạo `Prisma.PrismaClientKnownRequestError` P2002 thay `FakeUniqueViolation` trong mọi bản giả; xác minh test HTTP trên bản giả: một lượt trùng khoá không qua kiểm trước của service ra 409 `CONFLICT` như production
- [x] 2.2 Test hợp đồng phẳng `tests/identity-repository.contract.ts`, `tests/platform-repository.contract.ts`, `tests/category-repository.contract.ts`, cả ba hợp đồng gọi từ `tests/repository-contracts.test.ts` (bản giả) và `tests/repository-contracts.db.test.ts` (Postgres); `tests/repository-fakes.test.ts` gộp vào hợp đồng và bỏ: unique email và tên danh mục, khoá lạc quan nháp mẫu và phiên bản con số, tiêu mã một lần, phiên bản cài đặt kế tiếp; xác minh `pnpm test` và `pnpm test:db` cùng xanh trên cùng bộ ca

## 3. Tách service của `identity`

- [x] 3.1 Tách `identity.service.ts` thành `identity.auth.service.ts`, `identity.account.service.ts`, `identity.ops.service.ts`, `identity.shared.ts`; `createIdentityService` ghép lại, interface `IdentityService` giữ nguyên; xác minh mọi file dưới 500 dòng và toàn bộ test hiện có xanh **không sửa test nào**

## 4. Ghép module bằng danh sách

- [x] 4.1 `src/common/module/app-module.ts` (`AppModule`), `identity.module.ts`, `platform.module.ts`, `category.module.ts`; `buildApp` dựng theo thứ tự `identity` → `category` → `platform`, decorate `app.modules`; `server.ts` lặp `listeners` và `startup`; xác minh `pnpm start:local` khởi động như trước, log kết quả các bước khởi động
- [x] 4.2 `AppDeps` tách hạ tầng dùng chung và `repositories`; `buildTestApp` và các test dùng `app.identity` / `app.platform` / `app.category` chuyển sang `app.modules`; xác minh `pnpm test` xanh
- [x] 4.3 CLAUDE.md: cây thư mục (`common/module`, `<module>.module.ts`, các file service của `identity`), mục "Thêm một module mới" (một file module, một dòng danh sách, một khoá repository); `tests/README.md` thêm file test hợp đồng; xác minh `pnpm run format:check`

## 5. Kiểm tra tích hợp

- [x] 5.1 `pnpm run check`, `pnpm test:db`, `pnpm db:drift`, `pnpm run build` xanh; `pnpm start:local` lên, `/health/ready` up, một lượt khoá tài khoản staff vẫn treo quyền qua bộ phát mới

## Workflow follow-up

- Change không đổi hành vi (`skip_specs: true`): archive sau khi người dùng duyệt kết quả, không có spec để gộp.
- Sau archive: `pnpm exec prettier --write openspec` rồi `pnpm run spec:validate`.
