## ADDED Requirements

### Requirement: Hệ thống chỉ có một master

Hệ thống SHALL có đúng một tài khoản master. Công cụ của đội kỹ thuật MUST từ chối tạo master thứ hai, và MUST NOT có
luồng thay hay bỏ master trong app. Master vừa tạo SHALL dùng được bàn vận hành ngay sau khi đăng nhập, không phải thiết
lập gì thêm; quên mật khẩu thì lấy lại bằng luồng quên mật khẩu qua email như mọi tài khoản (chốt 23/10/2026).

#### Scenario: Tạo master thứ hai

- **WHEN** đã có một master và đội kỹ thuật chạy công cụ tạo thêm một master
- **THEN** công cụ từ chối và hệ thống vẫn chỉ có một master

#### Scenario: Master vừa tạo dùng bàn vận hành ngay

- **WHEN** đội kỹ thuật tạo master, rồi master đăng nhập bằng email và mật khẩu vừa đặt
- **THEN** master làm được thao tác của bàn vận hành mà không phải thiết lập gì thêm

## REMOVED Requirements

### Requirement: Đúng một master

**Reason**: Requirement gắn việc đặt lại lớp thứ hai cho master, mà lớp thứ hai bị bỏ ngày 23/10/2026.

**Migration**: Thay bằng "Hệ thống chỉ có một master" — giữ nguyên luật một master và công cụ tạo; bỏ công cụ đặt lại
lớp thứ hai.
