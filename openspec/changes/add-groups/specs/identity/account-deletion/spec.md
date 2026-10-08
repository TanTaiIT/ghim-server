## ADDED Requirements

### Requirement: Chủ nhóm phải chuyển chủ trước khi xoá tài khoản

Tài khoản đang là chủ nhóm MUST NOT tự xoá được — nếu không, nhóm mất chủ mà không qua giai đoạn thiếu chủ có
master xác nhận. Chủ nhóm SHALL chuyển chủ xong rồi mới xoá được tài khoản.

#### Scenario: Chủ nhóm xin xoá tài khoản

- **WHEN** chủ của một nhóm đang hoạt động yêu cầu xoá tài khoản
- **THEN** response có HTTP 409 `ACCOUNT_DELETE_BLOCKED` kèm lý do "đang là chủ nhóm"

#### Scenario: Lời chuyển chủ chưa được nhận

- **WHEN** chủ nhóm đã gửi lời chuyển chủ nhưng người nhận chưa đồng ý, và chủ nhóm yêu cầu xoá tài khoản
- **THEN** response có HTTP 409 `ACCOUNT_DELETE_BLOCKED` kèm lý do "đang là chủ nhóm"

#### Scenario: Đã chuyển chủ xong

- **WHEN** người nhận đã đồng ý làm chủ nhóm và chủ cũ, không vướng điều kiện chặn nào khác, yêu cầu xoá tài
  khoản
- **THEN** tài khoản được xoá
