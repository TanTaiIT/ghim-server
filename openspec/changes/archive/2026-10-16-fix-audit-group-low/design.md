# Design

> **Đã duyệt 16/10/2026.** Người dùng giao tech lead chọn phương án ("giải quyết những vấn đề ở đợt 4 luôn"), theo tiêu
> chí chạy ổn với lượng lớn người dùng.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục L3 (phần nhóm), L4, L5, L6, đọc lại ở f9d8cff.
- Chuyển sang riêng tư: chủ đổi chế độ → `going_private` + `privatization.started` → bên nghe của `listing` hạ tin
  thành viên, đẩy tin người ngoài rời nhóm → gọi `completePrivatization`. Thường xong trong vài giây (độ trễ outbox).
- `markOwnerless` / `lockBySystem` nhận cả `going_private` và xoá `target_mode`; C10 (fix-audit-stuck-data) đã chốt
  thiếu chủ và đang chuyển loại trừ nhau.

## Decisions

### 1. Chủ không dùng được → một đường (L3, L4)

- `loseOwner(groupId, ownerId, at)` ở phần dùng chung: còn điều hành viên dùng được → `markOwnerless` kèm đề cử; không
  → `lockBySystem(no_moderators)`. Cả hai chỉ nhận nhóm `active`.
- Gọi từ: bên nghe khoá tài khoản (như cũ), bên nghe xoá tài khoản khi `removeMember` trả `'owner'` (L3), và
  `completePrivatization` sau khi chuyển xong nếu chủ không còn `active` (L4).
- Thứ tự: `completePrivatization` đọc trạng thái chủ SAU khi commit. Lượt khoá commit trước lúc đọc → thấy `locked`,
  tự xử; commit sau → sự kiện khoá tới bên nghe khi nhóm đã `active`, bên nghe xử. Không ca nào lọt.
- Bỏ: giữ `target_mode` khi thiếu chủ rồi chuyển tiếp từ đó — phá CHECK `groups_going_private_check` và C10, phải sửa
  mọi đường trả nhóm về `active` (trả chủ, nhận chủ, master mở khoá).
- Bỏ: chặn xoá tài khoản bằng khoá chung với `group` — vượt ranh giới module; sửa ở bên nghe là đủ vì sự kiện xoá tới
  ít nhất một lần.
- Master tạm khoá nhóm đã không nhận `going_private` (`LOCKABLE`), không đổi.

### 2. Huỷ kèm theo phát sự kiện (L5)

- Hàm chung trong repository: `requestsCancelled`, `invitationsCancelled`, `offersCancelled` dựng sự kiện "đã xử"
  `outcome: 'cancelled'`; `cancelPendingIn(tx, { groupId, accountId, at, reason })` huỷ lời mời rồi đơn (`LOCK_ORDER`).
- Sáu chỗ: `insertMember` (đơn, `joined`), `removeMember` cấm (lời mời + đơn, `banned`), `lockBySystem` và
  `lockOwnerlessTimedOut` (lời chuyển chủ), `cancelPendingFor` (cả ba, `account_deleted`), `restoreOwner` dùng lại
  `offersCancelled`.
- `acceptOwnerOffer` khi người nhận chưa là thành viên (lời giao của master): huỷ lời mời + đơn của họ ở nhóm TRƯỚC khi
  nhận lời (lời mời → đơn → lời giao chủ); nhận thua thì `MemberRollback('gone')` cuộn lại cả lượt huỷ.
- Bên nghe thông báo đã xử mọi `join_request.decided` (gửi số đơn chờ mới cho quản trị); lý do lạ không sinh thông báo
  cá nhân. `invitation.decided`, `owner.offer_decided` chưa có bên nghe — phát cho đủ, như lượt hết hạn.
- Đóng nhóm vẫn không báo riêng đơn / lời mời đã quá hạn mà job chưa quét (như cũ).

### 3. Cài đặt và đơn vị (L6)

- Công tắc "hiện tên nhóm trên tin sàn" xét theo `finalMode` (chế độ sau lượt đổi ngay; đang / sắp chuyển thì là chế độ
  công khai hiện tại) — 409 `GROUP_MODE_CONFLICT`. Bật lại được sau khi nhóm chuyển xong.
- Khoá ngoại `group_announcements (group_id, unit_id) → group_units (group_id, id) ON DELETE CASCADE`: thông báo gửi
  riêng cho đơn vị không còn ai thấy (xoá đơn vị chỉ được khi không còn thành viên), để trống `unit_id` lại thành gửi
  cả nhóm — rộng hơn người gửi chọn. Khoá ngoại cũng chặn lượt gửi chen với lượt xoá đơn vị (P2003 → 409).

## Risks / Trade-offs

- Nhóm có chủ bị khoá vẫn ở `going_private` tới khi `listing` xử xong (vài giây, lâu hơn nếu bên nghe lỗi và thử lại) —
  trong lúc đó chủ bị khoá không làm gì được (phiên đã thu), điều hành viên vẫn điều hành.
- Xoá đơn vị xoá luôn thông báo của nó — quản trị mất lịch sử thông báo của một đơn vị đã giải tán.
