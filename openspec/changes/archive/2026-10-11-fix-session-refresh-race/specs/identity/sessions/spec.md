## ADDED Requirements

### Requirement: Làm mới phiên

Thiết bị SHALL làm mới được phiên bằng token làm mới đang dùng: mỗi lần làm mới MUST cấp token truy cập mới và
token làm mới mới, và token làm mới cũ từ đó MUST NOT làm mới được nữa. Token làm mới đã được thay mà còn được
gửi lên là dấu hiệu token bị lộ: hệ thống SHALL thu hồi cả phiên. Hai lượt làm mới gửi cùng lúc bằng cùng một
token MUST chỉ có một lượt thành công; lượt kia SHALL nhận lỗi riêng cho biết phiên vừa được làm mới, và phiên
MUST NOT bị thu hồi vì lượt đó.

#### Scenario: Làm mới bằng token đang dùng

- **WHEN** thiết bị làm mới phiên bằng token làm mới đang dùng
- **THEN** response có HTTP 200 với token truy cập mới và token làm mới mới, và lượt làm mới sau đó bằng token
  cũ không còn được chấp nhận

#### Scenario: Token đã được thay bị gửi lại

- **WHEN** một token làm mới đã được thay bằng token mới mà vẫn được gửi lên để làm mới
- **THEN** response có HTTP 401 `SESSION_REVOKED`, phiên bị thu hồi, và token làm mới mới của phiên đó cũng
  không làm mới được nữa

#### Scenario: Hai lượt làm mới cùng lúc

- **WHEN** app gửi hai lượt làm mới cùng lúc bằng cùng một token làm mới
- **THEN** một lượt có HTTP 200, lượt kia có HTTP 409 `REFRESH_CONFLICT`, và token làm mới của lượt 200 vẫn
  làm mới tiếp được

#### Scenario: Lượt thua không thu hồi phiên

- **WHEN** lượt làm mới nhận HTTP 409 `REFRESH_CONFLICT` và app dùng tiếp token truy cập của lượt thành công
- **THEN** phiên vẫn hoạt động, và danh sách thiết bị của người dùng vẫn có thiết bị đó
