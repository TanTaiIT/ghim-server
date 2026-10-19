## ADDED Requirements

### Requirement: Chỉ người dùng xoá hội thoại với một đội

Với hội thoại với một đội, người dùng SHALL xoá được hội thoại ở phía mình như hội thoại về tin; đội vẫn thấy đủ hội
thoại. Người trong đội MUST NOT xoá hội thoại đó — đội là nơi giữ lại lịch sử cho người kế tiếp trong đội.

#### Scenario: Người dùng xoá hội thoại hỗ trợ

- **WHEN** người dùng xoá hội thoại hỗ trợ ở phía mình
- **THEN** hội thoại không còn trong danh sách của người dùng, còn staff hỗ trợ vẫn đọc được đủ tin nhắn

#### Scenario: Đội trả lời sau khi người dùng đã xoá

- **WHEN** người dùng đã xoá hội thoại với quản trị nhóm ở phía mình và quản trị gửi một tin nhắn mới
- **THEN** hội thoại hiện lại trong danh sách của người dùng với đủ tin nhắn cũ

#### Scenario: Quản trị xoá hội thoại

- **WHEN** chủ nhóm xoá hội thoại của một người dùng với quản trị nhóm
- **THEN** response có HTTP 403 `FORBIDDEN` và hội thoại vẫn trong danh sách của mọi quản trị
