# identity/id-verification Specification

## Purpose

Cho người dùng tự nguyện xác minh giấy tờ như một tính năng phụ, tách hẳn khỏi luồng chính: kết quả chỉ
được lưu lại, không thay đổi bất kỳ quyền hay quyết định nào (TK 7, cam kết 32).

## Requirements

### Requirement: Nộp giấy tờ tự nguyện

Người dùng SHALL nộp được giấy tờ để xác minh khi muốn; không thao tác nào của Ghim đòi phải có xác minh.

#### Scenario: Nộp giấy tờ

- **WHEN** người dùng nộp giấy tờ
- **THEN** response có HTTP 201 và hồ sơ xác minh ở trạng thái chờ duyệt

#### Scenario: Đang có hồ sơ chờ duyệt

- **WHEN** người dùng nộp tiếp khi đang có một hồ sơ chờ duyệt
- **THEN** response có HTTP 409 `CONFLICT`

### Requirement: Ai duyệt giấy tờ

Chỉ master và staff được giao việc duyệt giấy tờ SHALL duyệt hoặc từ chối hồ sơ xác minh, kèm lý do khi từ
chối.

#### Scenario: Staff không được giao việc

- **WHEN** một staff không được giao việc duyệt giấy tờ mở hồ sơ xác minh
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Duyệt hồ sơ

- **WHEN** staff được giao việc duyệt một hồ sơ
- **THEN** hồ sơ chuyển sang đã xác minh

### Requirement: Kết quả xác minh không ảnh hưởng gì

Kết quả xác minh MUST NOT chặn ai dùng app và MUST NOT thay đổi việc đăng tin, mức tin cậy, hạn mức hay quyết
định của máy duyệt.

#### Scenario: Bị từ chối xác minh

- **WHEN** hồ sơ xác minh của một người bị từ chối
- **THEN** người đó vẫn dùng app như trước, không có quyền hay hạn mức nào đổi

### Requirement: Số giấy tờ không hiện ra ngoài

Số giấy tờ MUST NOT xuất hiện trong hồ sơ công khai hay bất kỳ response nào dành cho người dùng khác.

#### Scenario: Xem hồ sơ người đã xác minh

- **WHEN** một người khác xem hồ sơ công khai của tài khoản đã xác minh
- **THEN** response không chứa số giấy tờ
