## ADDED Requirements

### Requirement: Người xử thấy lịch sử gậy của người bán

Người đang nhận một việc về tin SHALL thấy thêm lịch sử gậy của người bán: từng gậy với loại, điều quy định được
trích, ngày hết hạn, và gậy nào đã bị huỷ (TK 17).

#### Scenario: Người bán đang có gậy

- **WHEN** staff nhận việc về tin của một người bán đang có một gậy thường còn hiệu lực
- **THEN** staff thấy gậy đó kèm loại, điều quy định được trích và ngày hết hạn

#### Scenario: Gậy đã bị huỷ vì khiếu nại thắng

- **WHEN** staff nhận việc về tin của một người bán có một gậy đã bị huỷ vì khiếu nại thắng
- **THEN** staff thấy gậy đó được đánh dấu đã huỷ, không tính vào điểm gậy hiện tại
