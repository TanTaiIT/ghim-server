## ADDED Requirements

### Requirement: Đóng nhóm không huỷ báo cáo lừa đảo và hàng cấm

Khi nhóm đóng, báo cáo lừa đảo hay hàng cấm đang mở về tin trong nhóm SHALL vẫn mở và được staff được giao danh
mục của tin hoặc master xử trên bản lưu của tin — loại báo cáo này vốn ở chỗ staff, không thuộc việc của nhóm
(TK 10, cam kết 25).

#### Scenario: Nhóm đóng khi có báo cáo hàng cấm

- **WHEN** chủ nhóm đóng nhóm trong lúc một tin của nhóm có báo cáo "hàng cấm" đang mở
- **THEN** báo cáo vẫn mở trong hàng của staff được giao danh mục của tin

#### Scenario: Staff xử báo cáo sau khi nhóm đóng

- **WHEN** staff xác nhận đúng báo cáo "lừa đảo" về một tin của nhóm đã đóng
- **THEN** báo cáo đóng với kết quả "đúng" và mỗi người báo được báo kết quả đó
