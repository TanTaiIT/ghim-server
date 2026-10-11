# Tasks

## 1. Header cache

- [x] 1.1 `src/common/http/cache.ts` (ba hằng và helper đặt header) và hook `onSend` mặc định `no-store` trong `buildApp`; xác minh HTTP test: `/me`, `/ops/staff` cấm giữ lại; lỗi 404 trên route công khai cấm giữ lại
- [x] 1.2 Route công khai của `category` đặt header sau khi service trả kết quả: khu vực một ngày, danh mục và mẫu hiện hành 5 phút, phiên bản mẫu mãi mãi; xác minh HTTP test mọi scenario header của `category/regions` và `category/category-catalog`, kể cả bàn vận hành cấm giữ lại

## 2. Thu quyền staff khi xoá tài khoản

- [x] 2.1 `PlatformRepository.removeStaff` (idempotent, cùng hình dạng trong bản giả, ca hợp đồng) và `PlatformService.revokeStaffForDeletion`; `platform.events.ts` nghe `identity.account.deleted`; xác minh unit test ba scenario của requirement mới (staff, quyền đang treo, không mang quyền)
- [x] 2.2 Test DB qua bộ phát thật: xoá mềm tài khoản staff → `runOnce()` → không còn dòng quyền và grant theo danh mục

## 3. Tài liệu

- [x] 3.1 TK 5 (xoá tài khoản thì thu quyền staff) — sửa cùng lượt với delta spec
- [x] 3.2 CLAUDE.md (mặc định `no-store`, helper cache, bên nghe mới của `platform`); `tests/README.md`; xác minh `pnpm run format:check`

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm test:db`, `pnpm db:drift`, `pnpm run build` xanh

## Workflow follow-up

- Archive sau khi người dùng duyệt kết quả, rồi `pnpm exec prettier --write openspec` và `pnpm run spec:validate`.
