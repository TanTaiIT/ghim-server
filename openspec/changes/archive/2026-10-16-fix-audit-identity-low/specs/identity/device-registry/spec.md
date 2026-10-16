## ADDED Requirements

### Requirement: Staff không gỡ đánh dấu của chính mình

Staff được giao việc hỗ trợ MUST NOT gỡ đánh dấu đặt trên chính tài khoản của mình; chỉ master được (TK 4, nguyên tắc
không tự xử việc của mình).

#### Scenario: Staff gỡ đánh dấu của chính mình

- **WHEN** staff được giao việc hỗ trợ gỡ đánh dấu "nhiều tài khoản trên một máy" đặt trên tài khoản của chính mình
- **THEN** response có HTTP 403 `FORBIDDEN` và đánh dấu vẫn còn
