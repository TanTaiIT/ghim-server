## MODIFIED Requirements

### Requirement: Tài khoản có gậy nặng hoặc gậy nghiêm trọng không tự xoá được

Tài khoản đang có gậy nặng hoặc gậy nghiêm trọng còn hiệu lực MUST NOT tự xoá được. Gậy thường SHALL không chặn
việc xoá, vì nó đi theo email. Lý do trả về gọi gậy nặng là "cảnh cáo nặng" — chữ người dùng đọc.

#### Scenario: Xoá khi có gậy nặng

- **WHEN** người dùng đang có một gậy nặng còn hiệu lực xoá tài khoản
- **THEN** response có HTTP 409 `ACCOUNT_DELETE_BLOCKED` kèm lý do "đang có cảnh cáo nặng"

#### Scenario: Chỉ có gậy thường

- **WHEN** người dùng chỉ có gậy thường còn hiệu lực, không vướng điều kiện chặn nào khác, xoá tài khoản
- **THEN** tài khoản bị xoá

#### Scenario: Gậy nặng đã hết hạn

- **WHEN** gậy nặng duy nhất của người dùng đã hết hạn và người đó xoá tài khoản
- **THEN** tài khoản bị xoá

#### Scenario: Gậy nghiêm trọng đã hạ thành gậy nặng

- **WHEN** master hạ gậy nghiêm trọng của một người thành gậy nặng, mở khoá tài khoản, rồi người đó xoá tài khoản
- **THEN** response có HTTP 409 `ACCOUNT_DELETE_BLOCKED` kèm lý do "đang có cảnh cáo nặng"
