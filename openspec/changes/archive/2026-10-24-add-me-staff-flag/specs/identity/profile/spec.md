## ADDED Requirements

### Requirement: Hồ sơ của tôi cho biết quyền staff

Hồ sơ của chính mình SHALL cho biết tài khoản có đang mang quyền staff còn hiệu lực không (`platform/staff-permissions`),
để client biết có hiện lối vào bàn vận hành không. Quyền đang treo MUST tính là không có. Hồ sơ MUST NOT nói phạm vi
hay danh mục được giao, và hồ sơ công khai MUST NOT có cờ này.

#### Scenario: Staff xem hồ sơ của mình

- **WHEN** một người dùng mang quyền staff còn hiệu lực xem hồ sơ của mình
- **THEN** hồ sơ cho biết đang có quyền staff, và không có phạm vi hay danh mục nào

#### Scenario: Người dùng thường

- **WHEN** một người dùng chưa từng được gắn quyền staff xem hồ sơ của mình
- **THEN** hồ sơ cho biết không có quyền staff

#### Scenario: Quyền đang treo

- **WHEN** quyền staff của một người dùng đang treo và người đó xem hồ sơ của mình
- **THEN** hồ sơ cho biết không có quyền staff

#### Scenario: Quyền bị thu

- **WHEN** master thu toàn bộ quyền staff của một người dùng rồi người đó xem hồ sơ của mình
- **THEN** hồ sơ cho biết không có quyền staff

#### Scenario: Hồ sơ công khai của staff

- **WHEN** người khác xem hồ sơ công khai của một staff
- **THEN** response không có cờ quyền staff
