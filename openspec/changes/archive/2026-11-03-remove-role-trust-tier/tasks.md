# Tasks

## 1. Server

- [x] 1.1 `group/group.shared.ts`: bỏ `requireTrustedForRole` và `GroupTrustPort.tierOf`
- [x] 1.2 `group/group.admin.service.ts`: bỏ kiểm mức ở `acceptOwnerOffer` và `setModerator`
- [x] 1.3 `app.ts`: thôi nối `tierOf` cho module nhóm
- [x] 1.4 Tests: `trust-roles.http.test.ts` viết lại (T0 nhận được cả ba vai); `group-roles.http.test.ts` bỏ `seedTier`
      chỉ có để qua luật mức

## 2. Docs

- [x] 2.1 TK phần 5: bỏ vế "mức T1 trở lên" khỏi câu giữ vai
- [x] 2.2 Spec delta của change này

## 3. App

- [x] 3.1 Không đổi API (đã rà: app không có câu nào về mức khi nhận vai chủ nhóm / điều hành viên)

## 4. Kiểm tra

- [x] 4.1 `pnpm run check` (cần Postgres test đang chạy), `pnpm run build`, `pnpm run spec:validate` — 03/11/2026: `trust-roles.http`, `group-roles.http` xanh trên Postgres
- [ ] 4.2 Deploy: master giao chủ cho một tài khoản T0, tài khoản đó bấm đồng ý thành chủ nhóm
