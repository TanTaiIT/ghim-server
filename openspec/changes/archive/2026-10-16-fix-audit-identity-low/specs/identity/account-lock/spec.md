## ADDED Requirements

### Requirement: Mở khoá trả tài khoản về trạng thái trước khi khoá

Mở khoá SHALL trả tài khoản về đúng trạng thái lúc bị khoá: tài khoản đã xác nhận email trở lại hoạt động, tài khoản chưa
xác nhận email vẫn chưa xác nhận. Mở khoá MUST NOT coi một email là đã xác nhận.

#### Scenario: Mở khoá tài khoản chưa xác nhận email

- **WHEN** master khoá một tài khoản chưa nhập mã xác nhận email, rồi mở khoá, rồi chủ tài khoản gọi một thao tác cần email đã xác nhận
- **THEN** response có HTTP 403 `EMAIL_NOT_VERIFIED`

#### Scenario: Mở khoá tài khoản đã xác nhận email

- **WHEN** master khoá rồi mở khoá một tài khoản đã xác nhận email
- **THEN** tài khoản trở lại hoạt động và dùng được mọi tính năng như trước khi bị khoá
