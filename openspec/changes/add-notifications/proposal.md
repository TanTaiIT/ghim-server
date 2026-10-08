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

- Hộp thư trong app: mọi thông báo vào đây, chỉ người nhận xem được, mỗi thông báo thuộc đúng một trong chín
  nhóm.
- Báo tin nhắn mới cho bên nhận.
- Hiện thông báo lên màn hình điện thoại khi người nhận cho phép trên máy đó; máy không còn phiên thì không nhận.
- Không đẩy tin nhắn của hội thoại người nhận đang mở.
- Bật tắt từng nhóm thông báo; nhóm "tài khoản" luôn bật.
- Chủ nhóm, điều hành viên gửi thông báo cho cả nhóm; báo thành viên khi bảng tin nhóm có tin mới.

**Cố ý chưa làm trong change này** (làm ở change sau, hoặc đã có chủ ở change trước):

- Hạn lưu thông báo (90 ngày) → `ops/data-retention` (`add-data-retention`).
- Khi nào và báo câu gì cho từng chuyện (tin bị giữ, đơn được duyệt, gậy, mức lên xuống, báo cáo được xử…) — đã
  viết ở capability của module sở hữu chuyện đó; change này chỉ đưa thông báo tới người nhận và xếp nó vào nhóm.
- Nhắc tin sắp hết ngày hiển thị lúc 9 giờ sáng → `listing/display-period` (`add-listings`).
- Nhắc tin hết hạn sắp bị xoá hẳn → `ops/data-retention` (`add-data-retention`).

## Capabilities

### New Capabilities

- `notification/inbox`: hộp thư trong app, chín nhóm thông báo, báo tin nhắn mới, hiện lên màn hình điện thoại
  khi được cho phép, không đẩy tin nhắn của hội thoại đang mở.
- `notification/preferences`: bật tắt từng nhóm thông báo, nhóm "tài khoản" luôn bật.
- `notification/group-announcements`: chủ nhóm, điều hành viên gửi thông báo cho cả nhóm; báo tin mới trên bảng
  tin nhóm.

### Modified Capabilities

Không có.

## Impact

- Module `notification` (mới). Nhận chuyện cần báo từ mọi module qua sự kiện (TK 30); đọc `identity` (phiên đăng
  nhập), `group` (thành viên, vai), `messaging` (tin nhắn mới, hội thoại đang mở).
- Phụ thuộc change trước, phải archive trước: `add-identity`, `add-groups`, `add-listings`, `add-strikes` (tạm
  mất vai vì gậy nặng), `add-messaging`.
- **Phải chọn trước khi làm** (CLAUDE.md: hỏi trước khi thêm package / dịch vụ): dịch vụ đẩy thông báo lên điện
  thoại (FCM cho Android, APNs hay FCM cho iPhone); cách biết người nhận "đang mở đúng hội thoại" — dùng chung
  kênh realtime chọn cho `add-messaging`.
- **Câu hỏi mở** — TK không nói, cần người dùng chốt trước khi viết design:
  - Tắt một nhóm chỉ thôi hiện lên màn hình điện thoại, hay thông báo nhóm đó cũng không vào hộp thư? TK 24 viết
    "mỗi thông báo vào hộp thư" ngay cạnh "bật tắt từng nhóm". Spec chỉ hứa: nhóm tắt thì không hiện lên màn hình.
  - Trạng thái mặc định của tám nhóm tắt được khi tài khoản mới lập.
  - Người đăng nhập nhiều máy và đang mở hội thoại trên một máy: các máy khác có hiện tin nhắn đó không.
  - Mỗi tin nhắn là một thông báo trong hộp thư, hay gộp theo hội thoại.
  - Hộp thư có đánh dấu đã đọc, đếm chưa đọc, cho xoá thông báo không.
  - Từng loại chuyện thuộc nhóm nào khi tên nhóm chưa đủ rõ — vd lời mời vào nhóm, kết quả khiếu nại, lời chuyển
    chủ nhóm, nhắc tin sắp hết hạn.
  - Thông báo nhóm: điều hành viên phụ trách một lớp / phòng ban gửi cho cả nhóm hay chỉ đơn vị của mình; nội dung
    có qua bộ lọc cụm từ cấm không; có giới hạn số lần gửi không; nhóm tạm khoá, thiếu chủ, đã đóng có gửi được
    không; master có gửi được không.
  - "Tin mới trong nhóm": báo từng tin hay gộp theo đợt; nhóm đông có trần không; sửa tin, gia hạn, hiện lại sau
    tạm ẩn có tính là tin mới không; người ngoài có tin sống trong nhóm có nhận không.
  - Nhiều phần của đợt 1–5 đã hứa "được báo" trước khi có module `notification` (đợt 6). Các câu đó chạy thế nào
    trước đợt này — để trống, hay ghi sẵn sự kiện chờ `notification` nghe?
