## ADDED Requirements

### Requirement: Quyền staff bị treo hay bị thu thì việc đang nhận trả về hàng chờ

Khi quyền staff của một người bị treo, hoặc master thu danh mục hay toàn bộ quyền staff của người đó, mọi việc
người đó đang nhận thuộc phần bị treo hay bị thu SHALL trả về hàng chờ ngay, không đợi hết thời gian giữ, để
staff khác nhận được (TK 5).

#### Scenario: Staff bị khoá tài khoản khi đang nhận việc

- **WHEN** staff A đang nhận một việc thì tài khoản của A bị master khoá
- **THEN** việc trở về hàng chờ ngay và staff B cùng danh mục nhận được việc đó

#### Scenario: Staff bị thu một danh mục khi đang nhận việc

- **WHEN** staff A đang nhận một việc về tin Điện thoại thì master thu danh mục Điện thoại của A
- **THEN** việc trở về hàng chờ ngay và staff khác được giao Điện thoại nhận được việc đó
