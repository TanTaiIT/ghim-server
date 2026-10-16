# Proposal

## Why

Đợt 4 phần 2 của lượt sửa lỗi rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`): nhóm. Đọc lại ở f9d8cff, chưa
mục nào được sửa:

- **L3** (phần nhóm) — chủ nhóm không xoá được tài khoản, nhưng lượt kiểm "còn làm chủ nhóm nào" chạy trước lượt nhận
  làm chủ của cùng người đó commit: tài khoản bị xoá mà vẫn là chủ. Bên nghe "tài khoản đã xoá" bỏ qua dòng chủ → nhóm
  có chủ đã xoá, không ai thành thiếu chủ hay tạm khoá.
- **L4** — chủ bị khoá lúc nhóm đang chuyển sang riêng tư: nhóm sang thiếu chủ (hoặc tạm khoá) và mất chế độ đích, trong
  khi bên nghe của `listing` có thể đã đẩy tin người ngoài rời nhóm vĩnh viễn. Nhóm ở lại công khai mà người ngoài đã bị
  đẩy ra; yêu cầu chuyển của chủ bị bỏ lặng lẽ.
- **L5** — sáu chỗ huỷ đơn, lời mời, lời giao chủ không phát sự kiện (vào bằng đường khác, bị cấm, nhóm tạm khoá vì không
  còn ai giữ, khoá vì thiếu chủ quá hạn, tài khoản bị xoá): số đơn chờ quản trị nhóm thấy không cập nhật (trái spec
  `notification/realtime` "Báo hiệu để app tải lại"). Người chưa là thành viên nhận lời giao chủ: đơn, lời mời còn chờ
  của họ ở nhóm đó vẫn treo.
- **L6** — đổi sang riêng tư (phải qua trạng thái chuyển) kèm bật "hiện tên nhóm trên tin sàn": CHECK của bảng chặn và
  trả 409 `CONFLICT` chung thay vì `GROUP_MODE_CONFLICT`. Xoá đơn vị để lại thông báo gửi riêng cho đơn vị đó trỏ vào
  một đơn vị không còn.

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án (15/10/2026, nhắc lại 16/10/2026).

## What Changes

- **L3**: bên nghe "tài khoản đã xoá" gặp dòng chủ thì xử như chủ bị khoá — thiếu chủ kèm đề cử, hoặc tạm khoá.
- **L4**: nhóm đang chuyển sang riêng tư không sang thiếu chủ giữa chừng; chuyển xong rồi, nếu chủ không còn dùng được
  (bị khoá, đã xoá) thì nhóm mới sang thiếu chủ hay tạm khoá. Thiếu chủ và đang chuyển vẫn loại trừ nhau (C10).
- **L5**: mọi lượt huỷ kèm theo phát sự kiện "đã xử" như lượt huỷ do người dùng, kèm lý do (`joined`, `banned`,
  `account_deleted`). Nhận lời giao chủ khi chưa là thành viên huỷ đơn, lời mời còn chờ của người đó ở nhóm.
- **L6**: công tắc "hiện tên nhóm trên tin sàn" xét theo chế độ hiện hành — đang chuyển thì còn công khai → 409
  `GROUP_MODE_CONFLICT`. Thông báo nhóm có khoá ngoại tới đơn vị, xoá đơn vị thì xoá thông báo gửi riêng cho nó.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `group/group-roles`: thêm "Chủ nhóm bị xoá tài khoản giữa chừng", "Chủ bị khoá khi nhóm đang chuyển sang riêng tư".
- `group/membership`: thêm "Huỷ kèm theo vẫn báo".
- `group/group-modes`: thêm "Bật hiện tên nhóm khi đổi sang riêng tư".
- `notification/group-announcements`: thêm "Xoá đơn vị thì xoá thông báo gửi riêng cho nó".

## Impact

- **Code**: `group` (bên nghe khoá / xoá tài khoản, chuyển xong sang riêng tư, sáu chỗ huỷ kèm theo, nhận lời giao chủ,
  cài đặt nhóm).
- **Migration**: có — khoá ngoại `group_announcements (group_id, unit_id) → group_units` `ON DELETE CASCADE`; xoá trước
  các thông báo đã trỏ vào đơn vị không còn (không ai thấy được chúng).
- **API**: không đổi hình dạng; `PATCH /groups/:groupId` đổi `409 CONFLICT` thành `409 GROUP_MODE_CONFLICT` ở ca L6.
- **Sự kiện**: `group.join_request.decided`, `group.invitation.decided` thêm `reason` ở các lượt huỷ kèm theo;
  `group.owner.offer_decided` phát thêm ở các lượt khoá do hệ thống và tài khoản bị xoá.
