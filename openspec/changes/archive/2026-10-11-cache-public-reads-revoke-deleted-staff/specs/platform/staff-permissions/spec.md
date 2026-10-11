## ADDED Requirements

### Requirement: Tài khoản bị xoá thì quyền staff bị thu

Khi tài khoản mang quyền staff bị xoá, quyền staff SHALL bị thu hẳn — không treo, vì tài khoản đã xoá không quay
lại được. Việc thu do hệ thống làm, không cần master, và MUST áp cả cho quyền đang treo.

#### Scenario: Staff xoá tài khoản của mình

- **WHEN** Hùng, staff của danh mục Điện thoại, xoá tài khoản của mình
- **THEN** danh sách staff của danh mục Điện thoại không còn Hùng

#### Scenario: Quyền đang treo

- **WHEN** Mai có quyền staff đang treo (tài khoản đã được mở khoá nhưng master chưa trả lại quyền) và xoá tài
  khoản của mình
- **THEN** danh sách staff không còn Mai

#### Scenario: Xoá tài khoản không mang quyền staff

- **WHEN** một người dùng không mang quyền staff xoá tài khoản của mình
- **THEN** danh sách staff không đổi

## MODIFIED Requirements

### Requirement: Chỉ master cấp và sửa quyền staff

Chỉ master SHALL gắn, sửa phạm vi và thu quyền staff qua bàn vận hành. Staff MUST NOT gắn hay thu quyền của
ai qua bàn vận hành, kể cả của chính mình. Hệ thống tự treo quyền khi tài khoản bị khoá và tự thu quyền khi tài
khoản bị xoá (các requirement riêng); đó không phải thao tác của staff hay master.

#### Scenario: Staff thử gắn quyền cho người khác

- **WHEN** một staff gắn quyền staff cho một tài khoản khác
- **THEN** response có HTTP 403 `FORBIDDEN` và tài khoản kia không mang quyền nào

#### Scenario: Staff thử mở rộng phạm vi của mình

- **WHEN** staff của danh mục Điện thoại tự thêm danh mục Xe máy vào quyền của mình
- **THEN** response có HTTP 403 `FORBIDDEN`
