## ADDED Requirements

### Requirement: Báo hiệu hàng hỗ trợ cho staff

Kênh realtime SHALL báo hiệu số hội thoại hỗ trợ đang chờ đội trả lời tới mọi tài khoản đang mang quyền staff "hỗ trợ
người dùng" mỗi khi số đó đổi — có hội thoại mới chờ, hay đội vừa trả lời. Báo hiệu MUST NOT kèm nội dung tin nhắn hay
tên người dùng. Tài khoản không mang quyền đó MUST NOT nhận báo hiệu này.

#### Scenario: Có hội thoại mới chờ

- **WHEN** một người dùng nhắn hỗ trợ lần đầu trong lúc một staff hỗ trợ đang nối realtime
- **THEN** kết nối của staff đó nhận số hội thoại đang chờ mới

#### Scenario: Đội vừa trả lời

- **WHEN** một staff hỗ trợ trả lời hội thoại đang chờ
- **THEN** mọi staff hỗ trợ đang nối realtime nhận số hội thoại đang chờ đã giảm

#### Scenario: Staff không mang quyền hỗ trợ

- **WHEN** một tài khoản staff chỉ mang quyền duyệt giấy tờ đang nối realtime và có người nhắn hỗ trợ
- **THEN** kết nối đó không nhận báo hiệu hàng hỗ trợ
