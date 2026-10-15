# Tasks

**Đã duyệt 15/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. `listing`

- [x] 1.1 `applyBatch` có `prepare` chạy sau `FOR UPDATE` của mỗi lô; `cascade.reconcileHide`; cổng `group` mới
      `isBanned`, `memberUnit`; `identity.accountState` vào deps của `listing`
- [x] 1.2 Bên nghe tài khoản, nhóm, cấm, thành viên, danh mục, đơn vị, mức tin cậy đối chiếu trạng thái hiện tại; xác
      minh test HTTP: mỗi cặp xử lại sự kiện cũ sau sự kiện mới (hai chiều) ra đúng trạng thái hiện tại, không thêm N32

## 2. `group`, `platform`, `review`

- [x] 2.1 `group.onAccountLocked` / `onAccountUnlocked` chặn khi trạng thái tài khoản đã khác chiều; xác minh test: khoá →
      mở khoá → xử lại khoá thì nhóm vẫn có chủ
- [x] 2.2 `platform.suspendStaffForLock` chặn khi tài khoản không còn bị khoá; xác minh test: khoá → mở → trả quyền → xử lại
      khoá thì quyền vẫn hoạt động
- [x] 2.3 `review` rời / vào lại / gỡ cấm / khoá tài khoản theo trạng thái hiện tại; xác minh test: rời → vào lại → xử lại
      rời thì việc vẫn mở

## 3. Tài liệu và kiểm tra tích hợp

- [x] 3.1 `docs/RA-SOAT-15-10-2026.md` (C1), `docs/VIEC-DANG-DO.md`, CLAUDE.md (luật 12 nói rõ cách đối chiếu)
- [x] 3.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
