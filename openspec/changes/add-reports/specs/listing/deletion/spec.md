## ADDED Requirements

### Requirement: Tin đang bị báo cáo vẫn xoá được, báo cáo vẫn được xử

Người đăng SHALL xoá được tin đang có báo cáo mở. Việc xoá MUST NOT đóng báo cáo: báo cáo vẫn mở và người xử
SHALL xử nó trên bản lưu nội dung tin lúc xoá (TK 19, TK 23).

#### Scenario: Xoá tin đang bị báo cáo

- **WHEN** người đăng xoá một tin sàn đang có báo cáo mở
- **THEN** việc xoá thành công, người khác mở tin nhận HTTP 404 `NOT_FOUND`, và báo cáo vẫn mở trong hàng chờ

#### Scenario: Người xử xem bản lưu

- **WHEN** staff nhận việc báo cáo về tin đã bị người đăng xoá
- **THEN** staff thấy tiêu đề, mô tả, giá và ảnh của tin như lúc bị xoá

#### Scenario: Xử báo cáo về tin đã xoá

- **WHEN** staff bác báo cáo về một tin đã bị người đăng xoá
- **THEN** báo cáo đóng với kết quả "bác" và mỗi người báo được báo kết quả đó
