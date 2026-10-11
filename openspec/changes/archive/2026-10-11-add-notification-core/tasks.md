# Tasks

> Đã duyệt 11/10/2026, làm ngay sau `add-groups` trong cùng lượt; archive sau `add-groups`.

## 1. Change mới và hạ tầng

- [x] 1.1 Proposal và delta spec: chuyển `notification/inbox` (trừ hai requirement của push và tin nhắn), `notification/preferences`, requirement gửi thông báo cho cả nhóm của `notification/group-announcements` từ `add-notifications`; thêm requirement realtime, tắt tiếng từng nhóm, cờ nhắc, gộp, nội dung câu nhắc; thu hẹp `add-notifications` còn push, tin nhắn, tin mới trong nhóm; sửa TK 24, 28, 29 và CLAUDE.md mục Stack; xác minh `pnpm run spec:validate` xanh
- [x] 1.2 Cài `socket.io` (dependency) và `socket.io-client` (devDependency, chỉ để test); xác minh `pnpm install --frozen-lockfile` sạch và `pnpm run build` qua

## 2. Hộp thư và ánh xạ

- [x] 2.1 Migration `init_notification`: `notifications` (unique nguồn sự kiện + người nhận, index người nhận + thời điểm, partial index chưa đọc), `notification_preferences`, `group_notification_mutes`; xác minh test DB unique và `pnpm db:drift`
- [x] 2.2 `notification.service.ts`: `deliver` ghi theo lô, gộp theo `collapse_key`, tính cờ `alert` (bật tắt nhóm thông báo, tắt tiếng nhóm trừ chuyện về chính tư cách người nhận, trần gộp), mẫu câu tiếng Việt cho N1–N30 (`notification.matrix.ts`); xác minh test bảng đủ mọi dòng ma trận (`tests/notification-matrix.db.test.ts`), không câu nào chứa lý do hay tên điều hành viên
- [x] 2.3 `notification.module.ts`: đăng ký bên nghe cho mọi sự kiện `group.*`, ánh xạ theo ma trận design mục 1; xác minh test qua bộ phát thật: mỗi dòng N1–N30 tạo đúng thông báo cho đúng người, không báo người tự làm, giao trùng không sinh hai dòng
- [x] 2.4 `outbox.kick()`: chạy bộ phát ngay sau commit có sự kiện; xác minh test: thông báo có trong hộp thư trong vòng một giây sau thao tác, không chờ vòng 10 giây
- [x] 2.5 Route hộp thư, đếm chưa đọc, đánh dấu đã đọc, bật tắt nhóm thông báo, tắt tiếng từng nhóm; xác minh HTTP test mọi scenario của `notification/inbox`, `notification/preferences` và requirement tắt tiếng

## 3. Realtime

- [x] 3.1 Cổng socket.io `/realtime` gắn vào server: xác thực lúc bắt tay bằng `resolveActor`, phòng theo người và theo phiên, ngắt khi token hết hạn; xác minh test server thật + client: token sai bị từ chối, nhận `notification:new` kèm `alert` đúng người, người khác không nhận
- [x] 3.2 Ngắt socket khi khoá, xoá tài khoản và khi phiên bị thu hồi (`identity` gọi cổng `sessionsRevoked` sau khi ghi, design mục 2); xác minh test: khoá tài khoản → socket đóng; đăng xuất máy khác → chỉ socket của phiên đó đóng
- [x] 3.3 `notification:unread`, `me:groups-changed`, `group:pending`; xác minh test: duyệt đơn → người xin nhận `me:groups-changed`, quản trị nhận `group:pending` với số mới

## 4. Tài liệu và kiểm tra tích hợp

- [x] 4.1 `docs/realtime.md` cho đội app: cách nối (token trong `auth`, nối lại khi hết hạn), danh sách sự kiện và payload, luật cờ `alert`, tải lại số chưa đọc khi nối lại; CLAUDE.md, `tests/README.md`; xác minh `pnpm run format:check`
- [x] 4.2 `pnpm run check`, `pnpm db:drift`, `pnpm run build` xanh; bản build với env dev: một client socket thật nhận thông báo khi đơn được duyệt
