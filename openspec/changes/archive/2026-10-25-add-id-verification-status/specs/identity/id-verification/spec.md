## ADDED Requirements

### Requirement: Người nộp xem được hồ sơ của mình

Người đã đăng nhập SHALL đọc được hồ sơ xác minh nộp gần nhất của chính mình: trạng thái, lúc nộp, lúc duyệt, và lý do khi
bị từ chối. Response MUST NOT chứa số giấy tờ hay người đã duyệt.

#### Scenario: Chưa nộp lần nào

- **WHEN** người chưa từng nộp giấy tờ đọc hồ sơ xác minh của mình
- **THEN** response có HTTP 200 và không có hồ sơ nào

#### Scenario: Hồ sơ đang chờ duyệt

- **WHEN** người vừa nộp giấy tờ đọc hồ sơ xác minh của mình
- **THEN** response có HTTP 200, hồ sơ ở trạng thái chờ duyệt và không chứa số giấy tờ

#### Scenario: Hồ sơ bị từ chối

- **WHEN** hồ sơ của một người bị từ chối kèm lý do, rồi người đó đọc hồ sơ xác minh của mình
- **THEN** response có HTTP 200, hồ sơ ở trạng thái bị từ chối kèm đúng lý do và thời điểm duyệt, không nêu người duyệt

#### Scenario: Nộp lại sau khi bị từ chối

- **WHEN** người bị từ chối nộp lại giấy tờ rồi đọc hồ sơ xác minh của mình
- **THEN** response có HTTP 200 và là hồ sơ mới ở trạng thái chờ duyệt, không phải hồ sơ bị từ chối

#### Scenario: Chưa đăng nhập

- **WHEN** khách đọc hồ sơ xác minh
- **THEN** response có HTTP 401 `UNAUTHORIZED`
