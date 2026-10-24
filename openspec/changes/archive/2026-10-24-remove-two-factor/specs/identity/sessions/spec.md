## ADDED Requirements

### Requirement: Bàn vận hành chỉ đòi phiên đăng nhập hợp lệ

Master và tài khoản mang quyền staff đúng phạm vi SHALL làm được thao tác của bàn vận hành ngay khi có phiên đăng nhập
hợp lệ, dù phiên mở bằng mật khẩu hay bằng Google. Hệ thống MUST NOT đòi lớp xác thực thứ hai, MUST NOT có thao tác
thiết lập lớp thứ hai, và đăng nhập MUST NOT đọc mã từ ứng dụng tạo mã (chốt 23/10/2026).

#### Scenario: Staff vừa được gắn quyền làm việc ngay

- **WHEN** tài khoản vừa được gắn quyền staff danh mục Điện thoại đăng nhập bằng đúng mật khẩu rồi mở hàng chờ của
  danh mục đó
- **THEN** response có HTTP 200 với hàng chờ của danh mục Điện thoại

#### Scenario: Master đăng nhập bằng mật khẩu rồi dùng bàn vận hành

- **WHEN** master đăng nhập bằng đúng email và mật khẩu, không gửi mã nào, rồi gọi một thao tác của bàn vận hành
- **THEN** thao tác được thực hiện

#### Scenario: Tài khoản có quyền đăng nhập bằng Google

- **WHEN** tài khoản mang quyền staff đã liên kết Google đăng nhập bằng Google
- **THEN** phiên được mở và người đó làm được thao tác của bàn vận hành trong phạm vi quyền của mình

#### Scenario: Client cũ vẫn gửi mã lúc đăng nhập

- **WHEN** master đăng nhập bằng đúng mật khẩu và gửi kèm một mã 6 số bất kỳ
- **THEN** phiên được mở; mã bị bỏ qua

#### Scenario: Gọi thao tác thiết lập lớp thứ hai cũ

- **WHEN** staff gọi thao tác bắt đầu hay xác nhận thiết lập lớp thứ hai
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Staff ngoài phạm vi vẫn bị chặn

- **WHEN** staff chỉ mang danh mục Điện thoại mở hàng chờ của danh mục Xe cộ
- **THEN** response có HTTP 403 `FORBIDDEN`

## REMOVED Requirements

### Requirement: Đăng nhập hai lớp cho master và staff

**Reason**: Người dùng chốt bỏ lớp thứ hai ngày 23/10/2026 — chi phí vận hành (cài ứng dụng tạo mã, đặt lại khi mất
máy, chặn đăng nhập Google) không đáng với quy mô hiện tại; chấp nhận bàn vận hành chỉ còn mật khẩu bảo vệ.

**Migration**: Thay bằng "Bàn vận hành chỉ đòi phiên đăng nhập hợp lệ". Client bỏ màn thiết lập lớp thứ hai và ô nhập
mã lúc đăng nhập; lỗi 403 `TWO_FACTOR_REQUIRED` và 409 `TWO_FACTOR_ENABLED` không còn xảy ra. Bí mật ứng dụng tạo mã
đã lưu bị xoá; không có đường bật lại.
