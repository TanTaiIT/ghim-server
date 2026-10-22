## ADDED Requirements

### Requirement: Báo đề nghị giá và câu trả lời

Đề nghị giá mới SHALL được báo cho người bán, và câu trả lời của người bán SHALL được báo cho người mua, bằng thông báo
nhóm "tin nhắn" như một tin nhắn mới của hội thoại đó — cùng luật gộp, nhắc và không đẩy khi đang mở đúng hội thoại.
Câu nhắc nêu số tiền và kết quả, không nêu gì khác. Người gửi MUST NOT nhận thông báo về đề nghị hay câu trả lời của
chính mình.

#### Scenario: Người bán nhận đề nghị

- **WHEN** người mua gửi đề nghị 12.000.000 đồng
- **THEN** người bán được báo bằng thông báo nhóm "tin nhắn" nêu số tiền 12.000.000 đồng, và người mua không nhận thông
  báo nào về đề nghị đó

#### Scenario: Người mua nhận câu trả lời

- **WHEN** người bán chấp nhận đề nghị 12.000.000 đồng
- **THEN** người mua được báo bằng thông báo nhóm "tin nhắn" rằng người bán đã chấp nhận 12.000.000 đồng

#### Scenario: Đề nghị bị thay không báo

- **WHEN** đề nghị đang chờ chuyển sang "đã thay" vì người mua gửi đề nghị mới
- **THEN** người bán chỉ được báo về đề nghị mới, không có thông báo riêng nào về đề nghị bị thay

#### Scenario: App đang nối realtime

- **WHEN** người mua đang nối realtime và người bán trả lời đề nghị của người mua
- **THEN** kết nối của người mua nhận báo hiệu tin nhắn của hội thoại đó đã đổi, để app tải lại
