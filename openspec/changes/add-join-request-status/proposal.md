# Proposal

## Why

App Ghim (`ghim-app`) nối trang nhóm với server ngày 18/10/2026 và lộ ra một chỗ hở: hồ sơ nhóm (`GET
/groups/{groupId}`) chỉ cho biết người xem **đã là thành viên chưa** (`membership`), không cho biết người đó **đang có
đơn chờ** ở nhóm này. Người gửi đơn vào nhóm xét duyệt hay nhóm có mã, quay lại trang nhóm, sẽ thấy lại nút "Gửi đơn"
như chưa từng gửi; bấm thì nhận 409 `CONFLICT` "đã có một đơn đang chờ". Spec `group/membership` cho người xin **rút
đơn** ("Người xin rút đơn"), nhưng không có chỗ nào trả cho người xin biết là mình đang có đơn — nút "Rút đơn" không có
gì để dựa vào.

Không có route nào khác cho việc này: `GET /me/group-invitations` chỉ có lời mời và danh sách lớp, đơn xin vào chỉ quản
trị nhóm đọc được (`GET /groups/{groupId}/join-requests`).

## What Changes

- Hồ sơ nhóm kèm **đơn đang chờ của chính người xem** ở nhóm đó (`joinRequest`: mã đơn, lúc gửi, hạn tự huỷ) hoặc
  `null` — ở cả hai dạng của hồ sơ: đủ (nhóm công khai) và chỉ tên (người ngoài nhóm riêng tư · có mã đã gửi đơn bằng
  mã). Khách, thành viên và master luôn nhận `null`.
- Đơn đã được duyệt, bị từ chối, đã rút hay quá hạn 21 ngày không còn hiện — đúng với cách đơn được tính là "đang chờ"
  ở các luật hiện có.
- TK 9 thêm một câu: người xin thấy đơn đang chờ của mình trên trang nhóm và rút được (sửa trong cùng lượt).

**Cố ý chưa làm**:

- Danh sách mọi đơn đang chờ của tôi trên mọi nhóm (`GET /me/group-join-requests`) — app chưa có màn nào cần; trần 3
  đơn đang chờ đã báo bằng `JOIN_REQUEST_LIMIT` lúc gửi.
- Cho người bị từ chối biết lúc gửi lại được ngay trên hồ sơ — lượt gửi lại quá sớm đã trả 429
  `JOIN_REQUEST_TOO_SOON` kèm thời điểm.

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `group/membership`: thêm "Người xin thấy đơn đang chờ của mình".

## Impact

- **Code**: `group.membership.service` (`view` đọc `findPendingRequest` đã có), `group.schema` (`groupViewSchema` thêm
  `joinRequest` ở cả hai nhánh). Không thêm truy vấn cho thành viên hay khách.
- **API**: `GET /groups/{groupId}` thêm trường `joinRequest` (cộng thêm, không phá client cũ).
- **Migration**: không.
- **Tài liệu**: TK 9, CLAUDE.md (thứ tự change).
- **Client**: `ghim-app` hiện "Đơn đang chờ duyệt · Rút đơn" trên trang nhóm — việc của repo app.
