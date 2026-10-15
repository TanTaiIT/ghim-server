## MODIFIED Requirements

### Requirement: Lỗi khi chấm thì giữ cho người

Khi việc chấm chữ hoặc kiểm một ảnh báo lỗi hay không trả lời, kết quả SHALL là giữ cho người. Lỗi của máy
MUST NOT bao giờ dẫn tới cho qua, và tin vẫn được nhận chứ không bị trả lỗi cho người đăng.

#### Scenario: Chấm chữ lỗi

- **WHEN** việc chấm chữ báo lỗi lúc một tin được gửi
- **THEN** tin không bị từ chối và kết quả máy là giữ cho người

#### Scenario: Kiểm một ảnh lỗi

- **WHEN** chữ của tin không trúng dấu hiệu nào nhưng việc kiểm một trong các ảnh báo lỗi
- **THEN** kết quả máy là giữ cho người, không phải hiện đầy đủ hay hiện hạn chế

#### Scenario: Lỗi lúc kết luận

- **WHEN** việc đọc dữ kiện để kết luận lượt máy duyệt báo lỗi lúc một tin được gửi
- **THEN** tin vẫn được nhận và kết quả máy là giữ cho người
