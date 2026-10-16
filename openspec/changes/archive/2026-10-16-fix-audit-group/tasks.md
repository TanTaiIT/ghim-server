# Tasks

**Đã duyệt 15/10/2026** — người dùng giao tech lead chọn phương án (design, ghi chú đầu file).

## 1. Thứ tự khoá và lưới 409 (T18)

- [x] 1.1 `acceptOwnerOffer`, `decideJoinRequest`, `acceptInvitation`: đọc không khoá → khoá cặp → dòng nhóm → nhận có
      điều kiện; `removeMember` (cấm), `closeGroup`, `cancelPendingFor`, `expireDue`: lời mời → đơn → lời giao chủ →
      thành viên, lệnh cấm; `createInvitation`: khoá cặp → dòng nhóm → lời mời; xác minh test HTTP: duyệt đơn cùng lúc
      cấm người đó, nhận lời mời cùng lúc đóng nhóm → không lượt nào 500
- [x] 1.2 `error-handler`: Prisma P2034 → 409 `CONFLICT` "thử lại"; xác minh unit test (`tests/error-handler.test.ts`
      đổi mã ví dụ "chưa map" sang mã khác)

## 2. Nhận làm chủ khi đang bị cấm (T17)

- [x] 2.1 `acceptOwnerOffer` phát `group.ban.lifted` khi xoá được lệnh cấm; xác minh test HTTP: giao chủ cho người đang bị
      cấm có tin trong nhóm → tin hết lý do "bị cấm", danh sách người bị cấm không còn người đó

## 3. Lời mời mù, danh sách lời mời, danh sách người bị cấm (T19)

- [x] 3.1 Migration `group_invitations`: `email_hash`, `email_hint`, `account_id` cho phép trống, unique lời mời chờ theo
      (nhóm, dấu băm email); backfill từ `accounts`; xác minh test DB: hai lời mời chờ cùng dấu băm → vi phạm unique
- [x] 3.2 `invite`: mọi lượt mời ghi một dòng; mời lại đổi đơn vị; sự kiện chỉ khi có người nhận; xác minh test HTTP: mời
      email chưa có tài khoản, mời master, mời thành viên → mỗi lượt một dòng; mời lại với lớp khác → nhận lời vào lớp mới
- [x] 3.3 `GET /groups/:groupId/invitations`, `GET /groups/:groupId/bans`; xác minh test HTTP các scenario của
      `group/membership` (xem rồi thu hồi, hai dòng như nhau, điều hành viên đơn vị chỉ thấy đơn vị mình, 403)

## 4. Tài liệu và kiểm tra tích hợp

- [x] 4.1 `docs/RA-SOAT-15-10-2026.md` (T17, T18, T19), `docs/VIEC-DANG-DO.md`, CLAUDE.md nếu cần
- [x] 4.2 `pnpm run typecheck`, `lint`, `format:check`, `test:unit`, `spec:validate`, `build`, `db:drift`; test HTTP / DB
      trên CI
