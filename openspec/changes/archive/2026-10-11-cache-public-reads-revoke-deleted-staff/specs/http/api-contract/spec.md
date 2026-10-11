## ADDED Requirements

### Requirement: Mặc định không cho giữ lại response

Mọi response của API SHALL cấm app, trình duyệt và máy chủ trung gian giữ lại một bản, trừ khi chính endpoint
đó cho phép tường minh. Response lỗi MUST NOT cho phép giữ lại.

#### Scenario: Hồ sơ của tôi

- **WHEN** người dùng đã đăng nhập đọc hồ sơ của chính mình
- **THEN** response có HTTP 200 và cấm giữ lại

#### Scenario: Bàn vận hành

- **WHEN** master đọc danh sách staff ở bàn vận hành
- **THEN** response có HTTP 200 và cấm giữ lại

#### Scenario: Lỗi trên một endpoint cho phép giữ lại

- **WHEN** khách xem danh sách phường của một mã tỉnh không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND` và cấm giữ lại
