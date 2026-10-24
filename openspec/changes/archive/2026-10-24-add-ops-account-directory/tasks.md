# Tasks

Duyệt 24/10/2026 (người dùng: "tiến hành tiếp").

## 1. Server

- [x] 1.1 `identity`: `searchAccounts`, `accountCard` (repository + service + Pick ở `ops.service` của identity)
      (design mục 2)
- [x] 1.2 `ops`: `account-directory.service.ts`, schema `accountListQuerySchema` / `opsAccountSchema` /
      `opsAccountCardSchema`, route `GET /ops/accounts`, `GET /ops/accounts/:id` (`requireOps('support')`)
- [x] 1.3 Test HTTP mọi scenario của spec `ops/account-directory` (`tests/ops-accounts.http.test.ts`)

## 2. Tài liệu

- [x] 2.1 `docs/VIEC-DANG-DO.md` mục 8; CLAUDE.md thứ tự change

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; `opsApi.accounts`, `opsApi.account`; `useAccountSearch`, `useOpsAccount`; mục "Tất cả"
      của tab Người dùng thành ô tìm + danh sách; trang `/ops/user/[id]` đọc thẻ tài khoản, chỉ nút đúng trạng thái;
      `npm run typecheck`, `lint`, `test`
- [x] 3.2 Thử trên máy ảo: master tìm app.buyer theo tên và theo email, mở hồ sơ thấy trạng thái

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check` (test ở 4 worker nếu máy đang tải), `pnpm run build` (ghim-server)

## Workflow follow-up

- Archive bằng `/opsx:archive add-ops-account-directory` sau khi gộp vào `main`.
