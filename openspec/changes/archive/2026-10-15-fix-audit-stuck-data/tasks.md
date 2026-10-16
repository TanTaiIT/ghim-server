# Tasks

**Đã duyệt 15/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. `listing` — lý do tạm ẩn trên mọi đường ghi (C7)

- [x] 1.1 `reasonsAfterRecheck`, `reasonsAfterRewrite`, `placementsHiddenOnLeave` trong `hide.calc.ts`; đường sửa chuyển
      sang `reasonsAfterRewrite`; xác minh unit test trong `tests/hide.calc.test.ts`
- [x] 1.2 Gửi nháp, gia hạn dùng `reasonsAfterRecheck`; lưu nháp dùng `reasonsAfterRewrite`; rút về, lưu, gửi tin đã
      rời nhóm hẳn → 409 `LISTING_DETACHED`; gia hạn đổi nơi đăng khi có việc chờ → 409 `PLACEMENT_LOCKED`; xác minh
      test HTTP: rút về rồi đưa lên sàn chung (nhóm bị khoá, đã rời nhóm), đổi danh mục qua nháp, gia hạn lên sàn chung
      khi bị cấm, rút về tin của nhóm đã đóng, gia hạn đổi nơi đăng khi có việc chờ

## 2. `review` — lượt rời chỉ huỷ việc của tin bị ẩn (C8)

- [x] 2.1 `pendingInGroup(accountId, groupId, leave?)` lọc theo `placementsHiddenOnLeave`; bên nghe `group.member.left`
      của `review` truyền `reason`, `allowOutsiders`; xác minh test HTTP: rời nhóm đang nhận tin người ngoài giữ việc
      của tin "nhóm công khai", huỷ việc của tin "chỉ thành viên"; nhóm không nhận tin người ngoài và bị cấm thì huỷ cả
      hai

## 3. `identity` — ẩn danh thay vì xoá cứng (C9, T13)

- [x] 3.1 Migration nới `accounts_credential_check`; `anonymizeDeletedAccount` thay `purgeAccount`; xác minh test DB:
      CHECK vẫn chặn tài khoản đang hoạt động không có mật khẩu lẫn mã Google; ẩn danh không đụng tài khoản còn trong
      thời gian chờ
- [x] 3.2 `claimEmail` và đăng nhập Google qua `releaseDeleted`; xác minh test HTTP: đăng ký lại sau 90 ngày giữ dòng cũ
      (đã xoá, dấu `deleted:`, cùng dấu băm, dòng con còn); Google trong thời gian chờ → 409 `EMAIL_PENDING_DELETION`;
      sau 90 ngày → tài khoản mới, dòng cũ nhả mã Google

## 4. `group` — nhóm thiếu chủ (C10)

- [x] 4.1 `updateSettings` chặn `going_private` khi nhóm thiếu chủ → 409 `GROUP_OWNER_REQUIRED`; xác minh test: nhóm
      thiếu chủ còn tin "nhóm công khai" giữ nguyên trạng thái, chế độ, mốc thiếu chủ, không có sự kiện riêng tư hoá; không
      còn tin thì đổi chế độ ngay

## 5. Tài liệu và kiểm tra tích hợp

- [x] 5.1 `docs/RA-SOAT-15-10-2026.md` đánh dấu C7, C8, C9, C10, T13; `docs/VIEC-DANG-DO.md`; CLAUDE.md nếu luật đổi
- [x] 5.2 `pnpm run check`, `pnpm run format:check`, `pnpm run build`, `pnpm db:drift`
