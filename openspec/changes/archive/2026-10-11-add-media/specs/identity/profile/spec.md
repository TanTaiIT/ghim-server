## ADDED Requirements

### Requirement: Ảnh đại diện

Người dùng SHALL đặt, đổi và bỏ được ảnh đại diện của mình bằng một ảnh đã tải vào kho cho hồ sơ của mình, hoặc
bằng ảnh đại diện của tài khoản Google đã nối. Tài khoản tạo bằng đăng nhập Google SHALL mặc định dùng ảnh đại diện
Google. Hồ sơ công khai SHALL hiện ảnh đại diện trong kho bằng một đường xem có hạn do hệ thống cấp, MUST NOT để lộ
đường dẫn cố định vào kho.

#### Scenario: Đặt ảnh đại diện

- **WHEN** người dùng đặt ảnh đại diện bằng một ảnh đã tải xong cho hồ sơ của mình
- **THEN** response có HTTP 200 với hồ sơ mang ảnh mới, và hồ sơ công khai trả một đường xem mở được đúng ảnh đó

#### Scenario: Bỏ ảnh đại diện

- **WHEN** người dùng bỏ ảnh đại diện
- **THEN** response có HTTP 200 với hồ sơ không có ảnh đại diện

#### Scenario: Tài khoản mới tạo bằng Google

- **WHEN** một người lần đầu đăng nhập bằng Google và tài khoản Google có ảnh đại diện
- **THEN** tài khoản mới dùng ảnh đại diện Google đó
