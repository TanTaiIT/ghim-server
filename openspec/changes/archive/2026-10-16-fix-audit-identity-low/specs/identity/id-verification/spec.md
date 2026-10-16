## ADDED Requirements

### Requirement: Không ai duyệt giấy tờ của chính mình

Staff được giao duyệt giấy tờ MUST NOT duyệt hồ sơ giấy tờ của chính mình; chỉ master được (TK 4, nguyên tắc không tự xử
việc của mình).

#### Scenario: Staff duyệt hồ sơ của chính mình

- **WHEN** staff được giao duyệt giấy tờ duyệt hồ sơ do chính mình nộp
- **THEN** response có HTTP 403 `FORBIDDEN` và hồ sơ vẫn chờ duyệt

### Requirement: Hai người cùng duyệt một hồ sơ

Hai lượt duyệt cùng một hồ sơ đang chờ SHALL có đúng một lượt thành công; lượt kia MUST NOT ghi đè kết quả.

#### Scenario: Hai staff cùng duyệt

- **WHEN** hai staff cùng lúc duyệt một hồ sơ đang chờ, một người chấp nhận và một người từ chối
- **THEN** đúng một lượt nhận HTTP 200, lượt kia nhận HTTP 409 `CONFLICT`, và hồ sơ mang kết quả của lượt thành công
