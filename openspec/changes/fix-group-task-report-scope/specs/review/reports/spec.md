## MODIFIED Requirements

### Requirement: Người xử thấy báo cáo liên quan

Người đang nhận một việc về một tin hay một người SHALL thấy các báo cáo về tin đó và về người đăng, kể cả báo cáo đã
đóng: loại, số người báo, thời điểm từng lượt báo và kết quả. Điều hành nhóm và chủ nhóm mở việc ở bàn của nhóm SHALL
chỉ thấy báo cáo thường về chính tin đó; báo cáo lừa đảo hay hàng cấm (kể cả đã đóng), báo cáo về người, báo cáo về tin
khác của người đăng và hội thoại kèm báo cáo MUST NOT hiện với họ. Người xử MUST NOT thấy danh tính người báo.

#### Scenario: Việc về tin đang bị báo nhiều lần

- **WHEN** staff nhận việc về một tin có báo cáo đang mở với 3 lượt báo loại "lừa đảo"
- **THEN** staff thấy loại "lừa đảo", 3 người báo và thời điểm từng lượt báo

#### Scenario: Điều hành viên mở việc về tin trong nhóm

- **WHEN** tin trong nhóm từng bị báo "hàng cấm" (đã bác), người đăng có một tin khác bị báo "sai thông tin" và bị báo
  về người, rồi tin trong nhóm bị báo "sai thông tin" và điều hành viên mở việc đó
- **THEN** response có HTTP 200 với đúng một báo cáo — báo cáo "sai thông tin" về tin trong nhóm — và không có hội
  thoại nào; master mở cùng việc ở bàn vận hành thấy đủ bốn báo cáo
