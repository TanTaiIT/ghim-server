## ADDED Requirements

### Requirement: Có báo cáo đang mở vẫn tự xoá được tài khoản, báo cáo vẫn được xử

Người đang bị báo cáo, hoặc có tin đang bị báo cáo, SHALL tự xoá được tài khoản nếu không vướng điều kiện chặn
nào khác — giữ người dùng lại trái ý họ là sai (TK 7, cam kết 13). Việc xoá MUST NOT đóng báo cáo: trong 90 ngày
tài khoản ẩn, người xử SHALL xử báo cáo trên bản lưu của tin và hồ sơ, và kết quả "đúng" vẫn áp hệ quả như khi
tài khoản còn (TK 23).

#### Scenario: Tin của mình đang bị báo cáo

- **WHEN** người dùng có một tin đang có báo cáo mở, không vướng điều kiện chặn nào khác, xoá tài khoản
- **THEN** tài khoản được xoá và báo cáo về tin đó vẫn mở trong hàng chờ

#### Scenario: Chính mình đang bị báo cáo

- **WHEN** người dùng đang bị báo cáo loại "quấy rối", báo cáo chưa đóng, xoá tài khoản
- **THEN** tài khoản được xoá và báo cáo vẫn mở trong hàng của staff được giao việc an toàn

#### Scenario: Người xử xem bản lưu

- **WHEN** staff nhận việc báo cáo về một tin của tài khoản đã xoá 20 ngày trước
- **THEN** staff thấy tiêu đề, mô tả, giá, ảnh của tin và hồ sơ người đăng như lúc tài khoản bị xoá

#### Scenario: Xử đúng sau khi tài khoản đã xoá

- **WHEN** staff được giao danh mục xác nhận đúng báo cáo về tin của một tài khoản đã xoá 30 ngày trước
- **THEN** báo cáo đóng với kết quả "đúng" và mỗi người báo được báo kết quả đó

#### Scenario: Vẫn vướng điều kiện chặn khác

- **WHEN** người dùng đang bị báo cáo và đang là chủ nhóm xoá tài khoản
- **THEN** response có HTTP 409 `ACCOUNT_DELETE_BLOCKED` kèm lý do "đang là chủ nhóm", không nêu báo cáo
