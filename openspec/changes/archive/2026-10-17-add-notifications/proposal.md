# Proposal

## Why

Nhiều phần của Ghim hứa "người dùng được báo": tin bị giữ hay được duyệt, đơn vào nhóm, gậy, mức tin cậy lên
xuống, báo cáo được xử, tin nhắn mới. Nguyên tắc 8 (TK 4) — người dùng luôn biết mình đang ở đâu — chỉ đúng khi
có một đường đưa những câu đó tới người nhận. TK 24 chốt đường đó: mỗi thông báo vào hộp thư trong app và, nếu
người dùng cho phép, hiện thêm lên màn hình điện thoại; chín nhóm bật tắt được, nhóm "tài khoản" luôn bật; đang
mở đúng hội thoại thì không đẩy tin nhắn đó; chủ nhóm và điều hành viên gửi được thông báo cho cả nhóm. TK 26 xếp
việc gửi thông báo vào nhóm việc chạy ngay khi có chuyện.

Đợt 6 theo TK 29. TK 27 không có cam kết riêng cho thông báo; change này là đường truyền cho mọi câu "được báo" ở
các phần khác và không thêm hay bớt cam kết nào.

## What Changes

> Thu hẹp ngày 11/10/2026: hộp thư, chín nhóm bật tắt, tắt tiếng từng nhóm, realtime, báo chuyện của nhóm và thông
> báo của nhóm đã chuyển sang `add-notification-core` (đợt 1). Change này còn ba phần dưới.

- Báo tin nhắn mới cho bên nhận.
- Đẩy thông báo lên điện thoại khi người nhận cho phép trên máy đó; máy không còn phiên thì không nhận — đọc cờ nhắc
  mà `add-notification-core` đã tính (bật tắt nhóm, tắt tiếng nhóm, gộp). Thiết kế đã giữ sẵn ở design của
  `add-notification-core` mục 3 (Expo Push Service, token gắn phiên).
- Không đẩy tin nhắn của hội thoại người nhận đang mở.
- Báo thành viên khi bảng tin nhóm có tin mới — chuyển sang `add-listings` khi làm đợt 2 (cần tin đăng).

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `notification/inbox`: thêm báo tin nhắn mới, đẩy lên điện thoại, không đẩy tin nhắn của hội thoại đang mở.
- `notification/group-announcements`: thêm báo tin mới trên bảng tin nhóm.

## Impact

- Module `notification` đã có từ `add-notification-core`; change này thêm bên nghe của `messaging` và bên gửi push.
- Phụ thuộc change trước, phải archive trước: `add-notification-core`, `add-messaging`, `add-strikes`.
- **Phải chọn trước khi làm**: dịch vụ đẩy (đề xuất Expo Push Service — design của `add-notification-core` mục 3);
  cách biết người nhận "đang mở đúng hội thoại" dùng kênh realtime socket.io đã có.
- Câu hỏi mở đã chốt ở `add-notification-core` (11/10/2026): tắt nhóm chỉ thôi nhắc, hộp thư vẫn nhận; chín nhóm
  bật mặc định; có đếm chưa đọc và đánh dấu đã đọc; điều hành viên đơn vị gửi cho đơn vị mình, 5 thông báo mỗi ngày,
  nhóm khoá không gửi được; các phần đợt 1–5 phát sự kiện, `notification` nghe. Còn mở cho change này:
  - Người đăng nhập nhiều máy và đang mở hội thoại trên một máy: các máy khác có hiện tin nhắn đó không.
  - Mỗi tin nhắn là một thông báo trong hộp thư, hay gộp theo hội thoại.
  - "Tin mới trong nhóm": trần nhắc, sửa tin hay gia hạn có tính là tin mới không (quyết ở `add-listings`).
