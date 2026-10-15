## ADDED Requirements

### Requirement: Gửi tin đúng lúc tắt danh mục hay khoá tài khoản

Lượt gửi trùng lúc danh mục bị tắt hay tài khoản người đăng bị khoá SHALL hoặc bị từ chối, hoặc để tin lên mang lý do
tạm ẩn tương ứng; tin MUST NOT hiện ra như thể danh mục còn bật hay tài khoản chưa bị khoá (chốt 15/10/2026).

#### Scenario: Danh mục bị tắt trong lúc gửi nháp

- **WHEN** người dùng gửi nháp, và danh mục của nháp bị tắt sau khi lượt gửi đã kiểm danh mục nhưng trước khi ghi
- **THEN** response có HTTP 409 `CATEGORY_DISABLED` và nháp vẫn là nháp

#### Scenario: Tài khoản bị khoá trong lúc gửi nháp

- **WHEN** người dùng gửi nháp, và tài khoản bị khoá sau khi lượt gửi đã qua bước đăng nhập nhưng trước khi ghi
- **THEN** response có HTTP 403 `ACCOUNT_LOCKED` và nháp vẫn là nháp
