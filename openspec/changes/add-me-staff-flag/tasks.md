# Tasks

## 1. Cờ trong hồ sơ của tôi

- [x] 1.1 `identity.schema` `meSchema` thêm `staff: z.boolean()`; `MeDto` thêm `staff`; `toMe` nhận thêm cờ; hàm dựng
      hồ sơ trong `account.service` hỏi `privilegeSource.staffGrant` — đúng khi `status === 'active'` (design mục 2, 3)
- [x] 1.2 Test HTTP mọi scenario của "Hồ sơ của tôi cho biết quyền staff" (`profile.http.test.ts`): staff còn hiệu lực,
      người dùng thường, quyền đang treo, quyền bị thu, hồ sơ công khai không có cờ; `PATCH /me` cũng trả cờ

## 2. Tài liệu

- [x] 2.1 CLAUDE.md: thêm `add-me-staff-flag` vào thứ tự change; `docs/VIEC-DANG-DO.md` cập nhật việc của `ghim-app`

## 3. Kiểm tra tích hợp

- [x] 3.1 `pnpm run check` (gồm test DB), `pnpm run format:check`, `pnpm run build`

## Workflow follow-up

- Archive bằng `/opsx:archive add-me-staff-flag` sau khi nhóm 3 xanh.
- `ghim-app`: `npm run api:sync`, `opsAccess = role === 'master' || staff`.
