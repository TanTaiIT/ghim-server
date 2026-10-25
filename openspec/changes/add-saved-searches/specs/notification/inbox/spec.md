## RENAMED Requirements

- FROM: `### Requirement: Mỗi thông báo thuộc đúng một trong chín nhóm`
- TO: `### Requirement: Mỗi thông báo thuộc đúng một trong mười nhóm`

## MODIFIED Requirements

### Requirement: Mỗi thông báo thuộc đúng một trong mười nhóm

Mỗi thông báo SHALL thuộc đúng một trong mười nhóm: tin nhắn · tin đăng của bạn · nhóm của bạn · báo cáo của bạn ·
tài khoản · mức tin cậy và gậy · thông báo của nhóm · tin mới trong nhóm · hỗ trợ · tìm kiếm đã lưu.

#### Scenario: Chuyện về tư cách trong nhóm

- **WHEN** người dùng được báo vừa bị gỡ khỏi một nhóm
- **THEN** thông báo thuộc nhóm "nhóm của bạn"

#### Scenario: Thông báo của nhóm

- **WHEN** chủ nhóm gửi một thông báo cho nhóm
- **THEN** thông báo thành viên nhận thuộc nhóm "thông báo của nhóm"

#### Scenario: Tin mới khớp lượt tìm đã lưu

- **WHEN** người dùng được báo có tin mới khớp một lượt tìm mình đã lưu
- **THEN** thông báo thuộc nhóm "tìm kiếm đã lưu"
