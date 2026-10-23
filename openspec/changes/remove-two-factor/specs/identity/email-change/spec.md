## ADDED Requirements

### Requirement: Xin đổi email chỉ đòi mật khẩu hiện tại

Lượt xin đổi email SHALL đòi mật khẩu hiện tại; sai hay thiếu thì response có HTTP 401 `INVALID_CREDENTIALS` và không
mã nào được gửi. Lượt xin MUST NOT đòi mã từ ứng dụng tạo mã, kể cả với master và staff (chốt 23/10/2026). Tài khoản
chưa có mật khẩu (chỉ đăng nhập bằng Google) MUST NOT xin đổi email được: response có HTTP 409 `PASSWORD_NOT_SET`.

#### Scenario: Sai mật khẩu

- **WHEN** người dùng xin đổi email kèm mật khẩu sai
- **THEN** response có HTTP 401 `INVALID_CREDENTIALS`, và không thư mã nào được gửi tới email mới

#### Scenario: Staff xin đổi email chỉ với mật khẩu

- **WHEN** staff xin đổi email kèm đúng mật khẩu và không gửi mã nào khác
- **THEN** thư mã xác nhận được gửi tới email mới

#### Scenario: Tài khoản chỉ đăng nhập bằng Google

- **WHEN** người dùng chỉ đăng nhập bằng Google, chưa đặt mật khẩu, xin đổi email
- **THEN** response có HTTP 409 `PASSWORD_NOT_SET`

## REMOVED Requirements

### Requirement: Xin đổi email phải nhập lại mật khẩu

**Reason**: Requirement đòi thêm mã từ ứng dụng tạo mã với tài khoản đã bật lớp thứ hai, mà lớp thứ hai bị bỏ ngày
23/10/2026.

**Migration**: Thay bằng "Xin đổi email chỉ đòi mật khẩu hiện tại" — giữ nguyên mật khẩu bắt buộc và
`PASSWORD_NOT_SET`; client bỏ trường mã khỏi lượt xin (gửi kèm vẫn được, bị bỏ qua).
