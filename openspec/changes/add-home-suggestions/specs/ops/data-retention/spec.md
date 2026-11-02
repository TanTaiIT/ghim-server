## ADDED Requirements

### Requirement: Lịch sử xem và tìm kiếm

Lượt xem tin và lượt tìm kiếm trong lịch sử của một người SHALL bị xoá hẳn khi cũ hơn `retention.activityDays` ngày
(khởi đầu 90) ở lượt dọn kế tiếp. Khi tài khoản bị xoá, toàn bộ lịch sử xem và tìm kiếm của tài khoản đó SHALL bị xoá
ngay ở bước xoá, không chờ hạn 90 ngày của tin và hồ sơ.

#### Scenario: Quá hạn

- **WHEN** một lượt xem có mốc lần cuối cách đây 91 ngày
- **THEN** lượt dọn kế tiếp xoá lượt xem đó

#### Scenario: Xoá tài khoản

- **WHEN** người dùng tự xoá tài khoản
- **THEN** lịch sử xem và tìm kiếm của tài khoản đó không còn ngay sau bước xoá
