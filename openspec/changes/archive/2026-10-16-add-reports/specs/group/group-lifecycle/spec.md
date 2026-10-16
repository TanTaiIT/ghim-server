## ADDED Requirements

### Requirement: Đóng nhóm không huỷ báo cáo

Khi nhóm đóng, mọi báo cáo đang mở về tin trong nhóm SHALL vẫn mở và được staff được giao danh mục của tin hoặc master
xử trên bản lưu của tin: báo cáo chỉ đóng bằng quyết định của người (cam kết 25), và nhóm đã đóng không còn ai điều hành
(TK 10, chốt 16/10/2026).

#### Scenario: Nhóm đóng khi có báo cáo hàng cấm

- **WHEN** chủ nhóm đóng nhóm trong lúc một tin của nhóm có báo cáo "hàng cấm" đang mở
- **THEN** báo cáo vẫn mở trong hàng của staff được giao danh mục của tin

#### Scenario: Nhóm đóng khi có báo cáo sai thông tin

- **WHEN** chủ nhóm đóng nhóm trong lúc một tin của nhóm có báo cáo "sai thông tin" đang mở ở hàng điều hành nhóm
- **THEN** báo cáo vẫn mở và chuyển sang hàng của staff được giao danh mục của tin

#### Scenario: Staff xử báo cáo sau khi nhóm đóng

- **WHEN** staff xác nhận đúng báo cáo "lừa đảo" về một tin của nhóm đã đóng
- **THEN** báo cáo đóng với kết quả "đúng" và mỗi người báo được báo kết quả đó
