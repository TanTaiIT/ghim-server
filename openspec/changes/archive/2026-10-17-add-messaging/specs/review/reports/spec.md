## ADDED Requirements

### Requirement: Báo cáo ngay từ hội thoại

Mỗi bên của một hội thoại SHALL báo cáo được bên kia ngay từ hội thoại, vd khi bị quấy rối hay lừa đảo. Báo cáo
MUST mang theo hội thoại đó làm bằng chứng và theo mọi luật chung của báo cáo.

#### Scenario: Báo cáo quấy rối từ hội thoại

- **WHEN** người mua gửi báo cáo loại "quấy rối" về người bán từ hội thoại của hai người
- **THEN** response có HTTP 201 và báo cáo được tạo kèm hội thoại đó

#### Scenario: Hội thoại về tin đã bán

- **WHEN** người mua gửi báo cáo loại "lừa đảo" từ một hội thoại mà tin của nó đã bán
- **THEN** báo cáo được tạo kèm hội thoại, như với hội thoại về tin đang hiển thị

#### Scenario: Đã chặn rồi mới báo cáo

- **WHEN** A đã chặn B rồi gửi báo cáo về B từ hội thoại chung
- **THEN** báo cáo được tạo kèm hội thoại; việc chặn không cản báo cáo

#### Scenario: Thiếu loại báo cáo

- **WHEN** một bên gửi báo cáo từ hội thoại mà không chọn loại báo cáo
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không báo cáo nào được tạo

### Requirement: Người xử đọc được hội thoại bị báo cáo

Người xử một báo cáo gửi từ hội thoại SHALL đọc được mọi tin nhắn của hội thoại đó cho tới khi báo cáo đóng, kể
cả khi một hay cả hai bên đã xoá hội thoại ở phía mình.

#### Scenario: Người bị báo xoá hội thoại ngay sau khi bị báo

- **WHEN** người bị báo cáo xoá hội thoại ở phía mình ngay sau khi báo cáo được gửi
- **THEN** người xử báo cáo vẫn đọc được đủ mọi tin nhắn của hội thoại

#### Scenario: Cả hai bên đã xoá

- **WHEN** người báo và người bị báo đều đã xoá hội thoại ở phía mình trước khi báo cáo được xử
- **THEN** người xử báo cáo vẫn đọc được đủ mọi tin nhắn của hội thoại
