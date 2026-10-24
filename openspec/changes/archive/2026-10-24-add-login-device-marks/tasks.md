# Tasks

Duyệt 24/10/2026 (người dùng: "làm theo đề xuất").

## 1. Server

- [x] 1.1 `prisma/schema.prisma` model `DeviceLogin` + quan hệ ở `Account`; migration `add_device_logins` kèm CHECK
      `device_logins_order_check` (design mục 1)
- [x] 1.2 `common/schemas/device-headers.ts`; `listing` import từ đó; `POST /auth/login`, `POST /auth/google` khai
      `headers` và truyền `deviceId` (design mục 5)
- [x] 1.3 `openSession` ghi dấu đăng nhập qua `repository.upsertDeviceLogin` (design mục 2)
- [x] 1.4 `accountsSharingDevice` hợp `device_posts` ∪ `device_logins` (design mục 3); `purgeDeviceData` xoá
      `device_logins` cũ, `ops/retention` cộng vào tổng (design mục 4)
- [x] 1.5 Test: `tests/device-logins.http.test.ts` (scenario của requirement mới + `sharedDeviceAccounts` hai nguồn);
      `tests/review-desk.http.test.ts` scenario "tài khoản phụ chỉ đăng nhập trên máy của staff";
      `tests/retention-data.http.test.ts` xoá dấu đăng nhập quá hạn

## 2. Tài liệu

- [x] 2.1 TK 8 "Dấu thiết bị còn dùng ở đâu"; sinh lại PDF. `docs/VIEC-DANG-DO.md` bỏ dòng mục 1; CLAUDE.md thứ tự
      change và ghi chú test review

## 3. `ghim-app`

- [x] 3.1 `npm run api:sync`; `api.login` gửi `deviceHeaders()`; test header; `npm run typecheck`, `lint`, `test`
- [x] 3.2 Thử trên máy ảo: đăng nhập rồi thấy dòng `device_logins` của tài khoản đó trên server dev

## 4. Kiểm tra tích hợp

- [x] 4.1 `pnpm run check`, `pnpm run build` (ghim-server)

## Workflow follow-up

- Archive bằng `/opsx:archive add-login-device-marks` sau khi gộp vào `main`.
