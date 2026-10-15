## ADDED Requirements

### Requirement: Ảnh nhạy cảm là cổng cứng

Mỗi ảnh của tin SHALL được kiểm nội dung nhạy cảm trong cùng lượt kiểm ảnh. Ảnh bị nhận là nhạy cảm SHALL làm tin
dính cổng cứng "ảnh nhạy cảm", với mọi hệ quả của cổng cứng ở `screening/hard-gates`.

#### Scenario: Tài khoản T3 gửi ảnh nhạy cảm

- **WHEN** tài khoản T3 gửi một tin không trúng dấu hiệu rủi ro nào nhưng có một ảnh nhạy cảm
- **THEN** tin dính cổng cứng "ảnh nhạy cảm" và kết quả máy là giữ cho người

#### Scenario: Không ảnh nào nhạy cảm

- **WHEN** mọi ảnh của tin đều không bị nhận là nhạy cảm
- **THEN** tin không dính cổng cứng "ảnh nhạy cảm"

#### Scenario: Chưa có kết quả kiểm nhạy cảm

- **WHEN** ảnh của tin đã có kết quả so trùng nhưng chưa có kết quả kiểm nhạy cảm
- **THEN** tin vẫn ở trạng thái đang kiểm và không hiện với người khác
