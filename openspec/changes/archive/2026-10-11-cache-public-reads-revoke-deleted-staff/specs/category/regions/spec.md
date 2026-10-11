## ADDED Requirements

### Requirement: Khu vực cho phép giữ lại một ngày

Danh sách tỉnh, thành, danh sách phường, xã và kết quả tìm khu vực SHALL cho phép app và máy chủ trung gian giữ
lại tối đa một ngày: khu vực chỉ đổi khi phát hành phần mềm mới.

#### Scenario: Danh sách tỉnh

- **WHEN** khách xem danh sách tỉnh, thành
- **THEN** response có HTTP 200 và cho phép giữ lại tối đa một ngày

#### Scenario: Tìm khu vực

- **WHEN** khách tìm khu vực "Bình Dương"
- **THEN** response có HTTP 200 và cho phép giữ lại tối đa một ngày
