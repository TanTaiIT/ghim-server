## ADDED Requirements

### Requirement: Báo tin nhắn của hội thoại với một đội

Tin nhắn của đội tới người dùng SHALL được báo cho người dùng, ký tên đội: tin nhắn của Hỗ trợ Ghim vào nhóm "hỗ trợ",
tin nhắn của quản trị nhóm vào nhóm "tin nhắn". Tin nhắn của người dùng tới quản trị một nhóm SHALL được báo cho mọi
chủ nhóm và điều hành viên đang giữ vai, bằng nhóm "tin nhắn". Staff hỗ trợ MUST NOT nhận thông báo vào hộp thư cho
từng tin nhắn hỗ trợ — hàng trên bàn vận hành là chỗ của họ. Người trong đội gửi tin MUST NOT làm người khác trong đội
nhận thông báo.

#### Scenario: Người dùng nhận trả lời của hỗ trợ

- **WHEN** staff hỗ trợ trả lời người dùng
- **THEN** người dùng nhận thông báo nhóm "hỗ trợ" ký "Hỗ trợ Ghim", không nêu tên staff

#### Scenario: Người dùng nhận trả lời của quản trị nhóm

- **WHEN** điều hành viên nhóm "Hội Nhiếp ảnh Sài Gòn" trả lời người dùng
- **THEN** người dùng nhận thông báo nhóm "tin nhắn" ký "Quản trị nhóm «Hội Nhiếp ảnh Sài Gòn»"

#### Scenario: Quản trị nhận tin của người dùng

- **WHEN** người dùng nhắn quản trị một nhóm có chủ nhóm và hai điều hành viên
- **THEN** cả ba nhận thông báo nhóm "tin nhắn" về tin nhắn đó

#### Scenario: Điều hành viên trả lời không báo cho đội

- **WHEN** một điều hành viên trả lời người dùng
- **THEN** chủ nhóm và điều hành viên khác không nhận thông báo nào về tin nhắn đó

#### Scenario: Staff hỗ trợ không nhận thông báo vào hộp thư

- **WHEN** người dùng nhắn hỗ trợ
- **THEN** không staff hỗ trợ nào nhận thông báo vào hộp thư về tin nhắn đó
