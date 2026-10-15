## ADDED Requirements

### Requirement: Một việc một quyết định

Mỗi việc SHALL có đúng một quyết định: lượt quyết thứ hai, hay lượt quyết đúng lúc việc vừa bị chuyển master hay bị
huỷ, MUST NOT ghi gì và nhận lỗi nói rõ việc đã đóng hay đã chuyển (chốt 15/10/2026).

#### Scenario: Quyết hai lần

- **WHEN** staff gửi cùng một quyết định hai lần liền cho một việc mình đang nhận
- **THEN** một lượt có HTTP 200, lượt kia có HTTP 409 `TASK_CLOSED`, và nhật ký chỉ có một quyết định
