# Tasks

## 1. Đường xác thực

- [x] 1.1 `IdentityRepository.findActorSession` (một câu SQL `sessions JOIN accounts`, bản Prisma và bản giả); `resolveActor` dùng nó; xác minh ca hợp đồng "phiên kèm tài khoản" xanh trên bản giả và Postgres
- [x] 1.2 `PrivilegeSource.staffGrant` thay bốn phương thức cũ; `PlatformRepository.findStaffGrant` một câu SQL (`LEFT JOIN` + `array_agg`); guard và `identity` kiểm phạm vi trong bộ nhớ; bản giả privilege source và test service đi qua `staffGrant`; xác minh test DB gom đúng danh mục và toàn bộ test guard xanh
- [x] 1.3 `login` / `loginWithGoogle` hỏi quyền một lần, truyền `privileged` vào `openSession`; xác minh test phiên và hai lớp xanh
- [x] 1.4 `tests/hot-paths.db.test.ts`: đếm câu SQL thật — `findActorSession` và `findStaffGrant` mỗi lượt đúng một câu

## 2. Dọn trùng lặp

- [x] 2.1 `actorOf` ở `src/common/auth/actor.ts`, bỏ năm bản chép; xác minh typecheck và lint sạch

## 3. Index

- [x] 3.1 `schema.prisma`: index `sessions(expires_at)`, partial `sessions(revoked_at)`, bỏ `disposable_domains_active_idx`; migration `tune_hot_path_indexes` bằng `migrate dev --create-only`, đọc SQL; xác minh `pnpm db:drift` ra "No difference detected"

## 4. Tài liệu và tích hợp

- [x] 4.1 CLAUDE.md (`PrivilegeSource.staffGrant`, `actorOf`, luật SQL tay cho đường nóng) và `tests/README.md`; xác minh `pnpm run format:check`
- [x] 4.2 `pnpm run check`, `pnpm test:db`, `pnpm db:drift`, `pnpm run build` xanh

## Workflow follow-up

- Change không đổi hành vi (`skip_specs: true`): archive sau khi người dùng duyệt kết quả.
