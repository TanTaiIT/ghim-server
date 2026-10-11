# Proposal

## Why

Nhóm là nơi quản trị và thành viên phải nghe được nhau: người được mời, người xin vào, người bị gỡ, cả nhóm khi
nhóm bị khoá hay đóng. TK 24 chốt đường đi của những câu đó — hộp thư trong app, chín nhóm thông báo bật tắt được,
nhóm "tài khoản" luôn bật, chủ nhóm và điều hành viên gửi được thông báo cho cả nhóm — nhưng TK 29 xếp thông báo ở
đợt 6, tức nhóm (đợt 1) và bốn đợt sau sống không có thông báo nào. Ngày 11/10/2026 người dùng chốt kéo phần lõi lên
đợt 1, làm cùng lượt với `add-groups`; đẩy lên điện thoại hoãn tới khi app làm.

Đợt 1 theo TK 29 (sửa cùng change). TK 27 không có cam kết riêng cho thông báo.

## What Changes

- Hộp thư trong app: mọi thông báo vào đây, chỉ người nhận xem được, thuộc đúng một trong chín nhóm; số chưa đọc,
  đánh dấu đã đọc; chuyện lặp lại theo nhóm được gộp.
- Bật tắt từng nhóm thông báo (nhóm "tài khoản" luôn bật) và **tắt tiếng từng nhóm**: chỉ thôi nhắc, thông báo vẫn
  vào hộp thư; tắt tiếng không chặn chuyện về chính tư cách của người đó trong nhóm.
- Kênh realtime (socket.io): app đang mở nhận thông báo mới kèm cờ nhắc, số chưa đọc và báo hiệu tải lại; kết nối
  bằng phiên đăng nhập, bị cắt khi khoá tài khoản, thu hồi phiên hay hết hạn token.
- Báo từng chuyện của nhóm cho đúng người (ma trận N1–N30 ở design): người được giao việc, người trong cuộc, quản
  trị nhóm, cả nhóm; không báo người tự làm; câu nhắc không nêu tên người quản trị, không chứa lý do khoá hay cấm.
- Chủ nhóm, điều hành viên gửi thông báo cho cả nhóm hay cho đơn vị mình (5 mỗi ngày, 1000 ký tự).

**Cố ý chưa làm** — giữ ở change khác:

- Đẩy lên điện thoại (Expo Push Service, token gắn phiên) → khi app làm; mỗi thông báo đã mang cờ nhắc để push đọc.
- Báo tin nhắn mới, không đẩy tin nhắn của hội thoại đang mở → `add-notifications` (đợt 6, thu hẹp).
- "Tin mới trong nhóm", tin của bạn tạm ẩn vì nhóm, việc chờ duyệt của nhóm → `add-listings`, `add-review-queues`.
- Hạn lưu thông báo 90 ngày → `add-data-retention`.

## Capabilities

### New Capabilities

- `notification/inbox`: hộp thư, chín nhóm, số chưa đọc, đánh dấu đã đọc, gộp.
- `notification/preferences`: bật tắt từng nhóm thông báo, nhóm "tài khoản" luôn bật, tắt tiếng từng nhóm.
- `notification/realtime`: kết nối realtime, chỉ nhận chuyện của mình, cắt khi mất quyền, báo hiệu tải lại.
- `notification/group-notices`: báo từng chuyện của nhóm cho đúng người và luật nội dung câu nhắc.
- `notification/group-announcements`: chủ nhóm, điều hành viên gửi thông báo cho nhóm.

### Modified Capabilities

_(không có — `add-notifications` thu hẹp, các requirement chuyển sang đây trước khi có spec nào được tạo)_

## Impact

- Module `notification` (mới) và hạ tầng realtime dùng chung `src/common/realtime/`. Nghe sự kiện `group.*`, đọc
  người nhận qua cổng của `group`, xác thực socket bằng `identity.resolveActor`; `identity` gọi cổng
  `sessionsRevoked` ngay sau khi thu hồi phiên để kênh realtime cắt kết nối (design mục 2).
- Package mới (đã duyệt 11/10/2026): `socket.io`; `socket.io-client` chỉ để test.
- Phụ thuộc `add-groups` (archive trước). Sửa TK 24, 28, 29 và CLAUDE.md mục Stack.
