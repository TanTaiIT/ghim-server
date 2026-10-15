## ADDED Requirements

### Requirement: Đóng nhóm huỷ việc đang chờ về tin trong nhóm

Khi nhóm đóng, mọi việc máy giữ, hạn chế do máy và mẫu hậu kiểm đang mở về tin trong nhóm SHALL bị huỷ. Huỷ
việc MUST NOT làm tin nào hiện lên (TK 10).

#### Scenario: Nhóm đóng khi có tin chờ duyệt

- **WHEN** chủ nhóm đóng nhóm trong lúc một tin của nhóm có việc hàng 0
- **THEN** việc đó bị huỷ, không còn trong hàng chờ của ai, và tin không hiện ở đâu

#### Scenario: Điều hành viên đang nhận việc lúc nhóm đóng

- **WHEN** điều hành viên đang nhận một việc hàng 5 về tin của nhóm thì nhóm đóng, rồi điều hành viên quyết
- **THEN** response có HTTP 409 `TASK_CLOSED`

#### Scenario: Đóng nhóm không huỷ việc chuyển lên sàn

- **WHEN** điều hành viên đã chuyển một tin của nhóm lên hàng 4, rồi chủ nhóm đóng nhóm
- **THEN** việc hàng 4 vẫn mở trong hàng của staff được giao danh mục của tin (chốt 15/10/2026)
