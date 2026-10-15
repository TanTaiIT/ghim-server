## ADDED Requirements

### Requirement: Xin đổi email phải nhập lại mật khẩu

Lượt xin đổi email SHALL đòi mật khẩu hiện tại, và mã từ ứng dụng tạo mã nếu tài khoản đã bật lớp thứ hai; sai hay
thiếu thì response có HTTP 401 `INVALID_CREDENTIALS` và không mã nào được gửi. Tài khoản chưa có mật khẩu (chỉ đăng
nhập bằng Google) MUST NOT xin đổi email được: response có HTTP 409 `PASSWORD_NOT_SET` (chốt 15/10/2026).

#### Scenario: Sai mật khẩu

- **WHEN** người dùng xin đổi email kèm mật khẩu sai
- **THEN** response có HTTP 401 `INVALID_CREDENTIALS`, và không thư mã nào được gửi tới email mới

#### Scenario: Đã bật lớp thứ hai mà không gửi mã

- **WHEN** staff đã bật lớp thứ hai xin đổi email kèm đúng mật khẩu nhưng không có mã từ ứng dụng tạo mã
- **THEN** response có HTTP 401 `INVALID_CREDENTIALS`, và không thư mã nào được gửi

#### Scenario: Tài khoản chỉ đăng nhập bằng Google

- **WHEN** người dùng chỉ đăng nhập bằng Google, chưa đặt mật khẩu, xin đổi email
- **THEN** response có HTTP 409 `PASSWORD_NOT_SET`

### Requirement: Đổi email xong báo email cũ và đăng xuất thiết bị khác

Khi email mới được xác nhận, hệ thống SHALL gửi thư báo tới email cũ, nêu email mới đã che bớt, và mọi phiên khác của
tài khoản SHALL bị thu hồi; phiên vừa xác nhận vẫn dùng được (chốt 15/10/2026).

#### Scenario: Xác nhận email mới khi đang đăng nhập hai máy

- **WHEN** người dùng đăng nhập trên hai máy và xác nhận email mới từ máy thứ nhất
- **THEN** email cũ nhận thư báo có email mới đã che bớt, máy thứ hai làm mới phiên nhận HTTP 401 `SESSION_REVOKED`,
  và máy thứ nhất vẫn dùng được
