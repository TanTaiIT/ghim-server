## ADDED Requirements

### Requirement: Tỉnh/thành của tôi

Người dùng SHALL chọn được tỉnh/thành của mình hay bỏ chọn; hồ sơ của tôi SHALL trả tỉnh đã chọn. Tỉnh/thành này là riêng
tư: hồ sơ công khai và mọi response cho người khác MUST NOT có nó. Mã tỉnh không có MUST bị từ chối và không đổi gì.

#### Scenario: Chọn tỉnh

- **WHEN** người dùng đặt tỉnh/thành của mình bằng một mã tỉnh có thật
- **THEN** response có HTTP 200 và hồ sơ của tôi trả đúng mã tỉnh đó

#### Scenario: Riêng tư

- **WHEN** người khác xem hồ sơ công khai của người đã chọn tỉnh
- **THEN** response không có tỉnh/thành của người đó

#### Scenario: Bỏ chọn

- **WHEN** người dùng đặt tỉnh/thành là null
- **THEN** hồ sơ của tôi không còn tỉnh nào

#### Scenario: Mã tỉnh không có

- **WHEN** người dùng đặt tỉnh/thành bằng một mã không có
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và tỉnh đã chọn trước đó giữ nguyên
