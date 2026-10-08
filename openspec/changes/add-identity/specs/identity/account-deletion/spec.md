## Purpose

Cho người dùng tự rời Ghim, nhưng không cho dùng việc xoá tài khoản để thoát một xử lý đang chờ (TK 7).

## ADDED Requirements

### Requirement: Người dùng tự xoá tài khoản

Người dùng SHALL tự xoá được tài khoản của mình. Xoá xong thì tài khoản không đăng nhập được và hồ sơ công
khai không còn hiện.

#### Scenario: Xoá thành công

- **WHEN** người dùng không vướng điều kiện chặn nào xoá tài khoản
- **THEN** mọi phiên bị thu hồi, đăng nhập lại nhận HTTP 401 `INVALID_CREDENTIALS`, và hồ sơ công khai trả
  HTTP 404 `NOT_FOUND`

### Requirement: Tài khoản đang bị khoá không tự xoá được

Tài khoản đang bị khoá MUST NOT tự xoá được — xoá là cách thoát khoá rẻ nhất nếu không có chốt này.

#### Scenario: Xoá khi đang bị khoá

- **WHEN** tài khoản đang bị khoá yêu cầu xoá (qua kênh hỗ trợ không cần đăng nhập)
- **THEN** yêu cầu bị từ chối với HTTP 409 `ACCOUNT_DELETE_BLOCKED` kèm lý do "đang bị khoá"
