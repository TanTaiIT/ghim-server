## Purpose

Cho chủ nhóm và điều hành viên nói một lời tới cả nhóm hay tới đơn vị mình phụ trách (TK 24).

## ADDED Requirements

### Requirement: Chủ nhóm và điều hành viên gửi thông báo cho nhóm

Chủ nhóm và điều hành viên cả nhóm SHALL gửi được một thông báo tới mọi thành viên hiện tại của nhóm; điều hành viên
đơn vị con SHALL gửi được tới thành viên đơn vị mình. Thông báo thuộc nhóm "thông báo của nhóm", dài 1–1000 ký tự,
tối đa 5 thông báo mỗi nhóm mỗi ngày (giá trị khởi đầu). Người không giữ vai trong nhóm MUST NOT gửi được; nhóm
đang tạm khoá, chờ giao chủ hay đã đóng MUST NOT gửi được.

#### Scenario: Chủ nhóm gửi thông báo

- **WHEN** chủ nhóm gửi một thông báo cho nhóm của mình
- **THEN** response có HTTP 201 và mọi thành viên hiện tại trừ chủ nhóm nhận thông báo thuộc nhóm "thông báo của
  nhóm"

#### Scenario: Điều hành viên cả nhóm gửi thông báo

- **WHEN** một điều hành viên phụ trách cả nhóm gửi một thông báo cho nhóm
- **THEN** response có HTTP 201 và mọi thành viên hiện tại trừ người gửi nhận thông báo đó

#### Scenario: Điều hành viên đơn vị gửi thông báo

- **WHEN** điều hành viên phụ trách lớp 12A1 gửi một thông báo
- **THEN** chỉ thành viên lớp 12A1 nhận thông báo, thành viên lớp khác thì không

#### Scenario: Thành viên thường

- **WHEN** một thành viên không giữ vai nào gửi thông báo cho nhóm
- **THEN** response có HTTP 403 `FORBIDDEN` và không ai nhận thông báo

#### Scenario: Nội dung rỗng hoặc quá dài

- **WHEN** chủ nhóm gửi một thông báo không có nội dung, hoặc dài 1001 ký tự
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không ai nhận thông báo

#### Scenario: Thông báo thứ sáu trong ngày

- **WHEN** nhóm đã gửi 5 thông báo trong ngày và chủ nhóm gửi thông báo thứ sáu
- **THEN** response có HTTP 429 `ANNOUNCEMENT_LIMIT` và không ai nhận thông báo

#### Scenario: Nhóm đang tạm khoá

- **WHEN** chủ của một nhóm đang tạm khoá gửi thông báo
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT`

#### Scenario: Người đã rời hay bị cấm khỏi nhóm

- **WHEN** chủ nhóm gửi thông báo sau khi một người đã rời nhóm và một người khác đã bị cấm khỏi nhóm
- **THEN** cả hai người đó không nhận thông báo

### Requirement: Thành viên xem lại thông báo của nhóm

Thành viên SHALL xem lại được các thông báo của nhóm gửi tới mình, mới nhất trước. Người không phải thành viên MUST
NOT xem được thông báo của nhóm.

#### Scenario: Thành viên xem lại

- **WHEN** một thành viên mở danh sách thông báo của nhóm mình
- **THEN** response có HTTP 200 với các thông báo gửi cho cả nhóm và cho đơn vị của người đó

#### Scenario: Người ngoài xem

- **WHEN** một người không phải thành viên mở danh sách thông báo của một nhóm công khai
- **THEN** response có HTTP 403 `FORBIDDEN`
