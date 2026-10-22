# Proposal

## Why

App Ghim (`ghim-app`) có hai lối nhắn không gắn tin nào: **"Chat với admin"** ở màn Trợ giúp, và **"Nhắn quản trị"** ở
trang một nhóm. TK 24 hiện nói "mỗi hội thoại gắn với **một tin**", và hội thoại của server là một cặp tin + người mua,
nên hai lối đó chưa có chỗ đứng. Lộ ra khi nối app với server ngày 18/10/2026.

Người dùng chốt ngày 18/10/2026 — đổi luật TK 24, sửa TK trong cùng lượt với change này:

- **Hỗ trợ Ghim**: mỗi người dùng một hội thoại với đội hỗ trợ. Mọi staff có quyền "hỗ trợ người dùng" (TK 5 — một
  trong ba việc toàn hệ thống master giao được) thấy chung một hàng và trả lời từ bàn vận hành. Người dùng chỉ thấy
  "Hỗ trợ Ghim", không thấy tài khoản cá nhân của staff — staff là quyền gắn lên tài khoản cá nhân (TK 5), lộ ra là lộ
  người.
- **Quản trị nhóm**: mỗi người dùng một hội thoại với quản trị của một nhóm. Chủ nhóm và mọi điều hành viên cùng thấy và
  trả lời; người dùng thấy "Quản trị nhóm «tên nhóm»", đúng cách nhóm đã ký quyết định của mình (TK 24 — không nêu tên
  điều hành viên). Ai xem được hồ sơ nhóm thì nhắn được; người bị cấm khỏi nhóm thì không.

Cam kết TK 27 liên quan: **1** (không ai xử việc của chính mình — staff không trả lời hội thoại hỗ trợ của chính mình),
**6** (điều hành nhóm không làm thay đổi gì trên tài khoản toàn hệ thống — nhắn tin không cho quản trị nhóm quyền nào
mới), **31** (hội thoại với đội theo hạn lưu của hội thoại). Thuộc đợt 6 của TK 29 (nhắn tin).

## What Changes

- Hội thoại có ba loại: **về một tin** (như cũ), **với Hỗ trợ Ghim**, **với quản trị một nhóm**. Hai loại sau gọi chung
  là hội thoại **với một đội**: một bên là người dùng, bên kia là cả đội — ai trong đội cũng đọc và trả lời được, một
  người đọc là cả đội đã đọc.
- Người dùng mở hội thoại hỗ trợ từ app; staff hỗ trợ có hàng hội thoại trên bàn vận hành (đang chờ trả lời trước,
  chờ lâu nhất trước), đọc, trả lời, và nhận báo hiệu số hội thoại đang chờ qua realtime.
- Người dùng mở hội thoại với quản trị một nhóm từ trang nhóm; chủ nhóm và điều hành viên thấy hội thoại đó trong danh
  sách hội thoại của mình trong app, trả lời như tin nhắn thường, được báo khi có tin mới.
- Tin nhắn của đội tới người dùng ký tên đội; người dùng không thấy ai trong đội viết. Người trong đội thấy ai viết.
- Hội thoại với một đội không tính vào hạn mức hội thoại mới, không bị chặn người áp vào, chỉ người dùng xoá được ở
  phía mình. Tin nhắn của staff hỗ trợ không qua bộ lọc cụm từ cấm; tin nhắn của quản trị nhóm thì qua, như mọi người
  dùng.
- TK 24 sửa luật "mỗi hội thoại gắn với một tin" thành ba loại hội thoại.

**Cố ý chưa làm**:

- Mở hội thoại hỗ trợ khi chưa xác nhận email hay chưa đăng nhập — TK 24 giữ "chưa xác nhận email thì chưa nhắn tin";
  người bị khoá đã có kênh hỗ trợ không cần đăng nhập (TK 22). Người kẹt ở bước xác nhận email là trường hợp đáng làm
  sau.
- Giao từng hội thoại hỗ trợ cho một staff, hạn xử, chuyển cấp — người dùng chọn hàng chung.
- Báo cáo từ hội thoại với một đội — báo cáo hiện nhắm một tin hay một tài khoản; quấy rối qua hội thoại nhóm vẫn báo
  cáo được tài khoản người viết ở phía quản trị (xem design, Risks).
- Trả giá trong hội thoại với một đội — trả giá gắn với một tin (`add-price-offers`).

## Capabilities

### New Capabilities

- `messaging/support-chat`: hội thoại với Hỗ trợ Ghim — mở, ký tên đội, staff trả lời từ bàn vận hành, hàng đang chờ.
- `messaging/group-admin-chat`: hội thoại với quản trị một nhóm — ai mở được, cả đội quản trị cùng thấy, ký tên nhóm,
  khi nhóm đóng hay người dùng bị cấm.

### Modified Capabilities

- `messaging/conversations`: "Mỗi tin và một người mua có đúng một hội thoại" thành luật của hội thoại về tin, nói rõ có
  hai loại hội thoại với một đội; "Người ngoài hội thoại nhận không tìm thấy" tính cả người trong đội; "Tin nhắn qua bộ
  lọc cụm từ cấm" trừ tin nhắn của staff hỗ trợ; thêm "Một người trong đội đọc là cả đội đã đọc" và "Hội thoại với một
  đội cho biết đội".
- `messaging/blocking`: thêm "Chặn không áp cho hội thoại với một đội".
- `messaging/conversation-deletion`: thêm "Chỉ người dùng xoá hội thoại với một đội".
- `notification/inbox`: thêm "Báo tin nhắn của hội thoại với một đội".
- `notification/realtime`: thêm "Báo hiệu hàng hỗ trợ cho staff".

## Impact

- **Code**: module `messaging` (loại hội thoại, mở hội thoại với đội, quyền đọc / gửi của người trong đội, DTO, route
  bàn vận hành), cổng sang `group` (thêm `conversationTeam`, `managedGroupIds`, `groupsByIds`, `bannedAmong`) và
  `platform` (`activeStaffWithScope` — ai đang mang quyền `support`), bảng câu thông báo tin nhắn, realtime.
- **API**: `POST /me/support/conversation`, `POST /groups/{groupId}/conversation`; `GET /ops/support/conversations`,
  `GET /ops/support/conversations/{id}`, `GET …/{id}/messages`, `POST …/{id}/messages`, `POST …/{id}/read`; hội thoại và
  tin nhắn có thêm trường; `listing` và `counterpart.accountId` của hội thoại, `senderId` của tin nhắn thành nullable.
- **Migration**: thêm loại hội thoại, `listing_id` / `seller_id` thành NULL được, cột nhóm và cột "chờ đội trả lời",
  CHECK và partial unique viết tay; không mất dữ liệu.
- **Tài liệu**: TK 24, `docs/messaging.md`, `docs/realtime.md`, CLAUDE.md.
- **Client**: `ghim-app` nối "Chat với admin" và "Nhắn quản trị" — việc của repo app. Bàn vận hành web — chưa có repo.
