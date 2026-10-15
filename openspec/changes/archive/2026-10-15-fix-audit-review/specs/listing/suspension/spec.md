## ADDED Requirements

### Requirement: Tin còn việc chờ người duyệt không chuyển lên sàn chung được

Tin đã rời nhóm hẳn mà còn việc chờ người duyệt — kể cả việc điều hành nhóm chuyển lên staff — MUST NOT chuyển lên sàn
chung, để không ai chuyển tin đi cho thoát việc đang chờ (TK 27 cam kết 19, chốt 15/10/2026).

#### Scenario: Chuyển tin đang chờ staff xem

- **WHEN** điều hành nhóm gỡ tin khỏi nhóm kèm "trái quy định sàn" và người đăng chuyển tin đó lên sàn chung trước khi staff xử
- **THEN** response có HTTP 409 `PLACEMENT_LOCKED` và không tin mới nào được tạo

#### Scenario: Staff bác rồi chuyển

- **WHEN** staff bác việc nhóm chuyển lên, rồi người đăng chuyển tin lên sàn chung
- **THEN** tin mới được tạo ở sàn chung và chuyển sang đang kiểm
