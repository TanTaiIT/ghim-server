## ADDED Requirements

### Requirement: Chặn không áp cho hội thoại với một đội

Chặn SHALL chỉ áp giữa hai người dùng trong hội thoại về tin. Hội thoại với Hỗ trợ Ghim hay với quản trị một nhóm MUST
NOT bị chặn người áp vào: bên kia là cả đội, không phải một người — người dùng muốn dừng thì xoá hội thoại ở phía mình.
Người dùng MUST NOT chặn được Hỗ trợ Ghim hay quản trị một nhóm như chặn một tài khoản.

#### Scenario: Đã chặn một điều hành viên, vẫn nhắn quản trị nhóm

- **WHEN** A đã chặn B, B là điều hành viên nhóm X, và A mở hội thoại với quản trị nhóm X
- **THEN** response có HTTP 201 và A gửi được tin nhắn cho quản trị nhóm X

#### Scenario: Hội thoại hỗ trợ không khoá

- **WHEN** người dùng đã chặn một tài khoản tình cờ mang quyền staff hỗ trợ
- **THEN** hội thoại hỗ trợ của người dùng vẫn nhận tin nhắn của cả hai phía
