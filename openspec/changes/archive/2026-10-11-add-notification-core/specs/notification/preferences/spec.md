## Purpose

Cho người dùng tự chọn chuyện nào được nhắc mình — theo nhóm thông báo và theo từng nhóm mình tham gia — trừ thông
báo về tài khoản luôn phải tới (TK 24).

## ADDED Requirements

### Requirement: Bật tắt từng nhóm thông báo

Người dùng SHALL xem được trạng thái bật / tắt của cả chín nhóm thông báo và SHALL bật hoặc tắt được riêng từng
nhóm, trừ nhóm "tài khoản". Thông báo thuộc nhóm đang tắt MUST vẫn vào hộp thư nhưng không được nhắc.

#### Scenario: Xem cài đặt thông báo

- **WHEN** người dùng mở cài đặt thông báo
- **THEN** response có HTTP 200 với đủ chín nhóm và trạng thái bật / tắt của từng nhóm

#### Scenario: Tắt một nhóm

- **WHEN** người dùng tắt nhóm "thông báo của nhóm" rồi chủ một nhóm của họ gửi thông báo
- **THEN** thông báo nằm trong hộp thư của họ và không được nhắc

#### Scenario: Tắt nhóm này không ảnh hưởng nhóm khác

- **WHEN** người dùng tắt nhóm "thông báo của nhóm" rồi đơn xin vào nhóm của họ được duyệt
- **THEN** thông báo về đơn được duyệt vẫn được nhắc

#### Scenario: Bật lại

- **WHEN** người dùng bật lại nhóm "thông báo của nhóm" đã tắt trước đó
- **THEN** thông báo của nhóm gửi tới sau lúc bật lại được nhắc như thường

#### Scenario: Tên nhóm không hợp lệ

- **WHEN** người dùng bật hay tắt một nhóm không thuộc chín nhóm
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

### Requirement: Nhóm "tài khoản" luôn bật

Nhóm "tài khoản" MUST luôn bật, kể cả với tài khoản vừa lập; người dùng không tắt được nhóm này.

#### Scenario: Tắt nhóm "tài khoản"

- **WHEN** người dùng tắt nhóm "tài khoản"
- **THEN** response có HTTP 400 `NOTIFICATION_GROUP_ALWAYS_ON` và nhóm "tài khoản" vẫn bật

#### Scenario: Tài khoản vừa lập

- **WHEN** một tài khoản vừa tạo mở cài đặt thông báo
- **THEN** cả chín nhóm đang bật

### Requirement: Tắt tiếng từng nhóm

Người dùng SHALL tắt tiếng và bật lại tiếng được một nhóm mà mình là thành viên. Thông báo thuộc nhóm đang tắt tiếng
MUST vẫn vào hộp thư nhưng không được nhắc — trừ thông báo về chính tư cách của người đó trong nhóm (được duyệt, bị
gỡ, bị cấm, lời mời, lời giao chủ, vai), vốn luôn được nhắc như thường.

#### Scenario: Thông báo của nhóm đang tắt tiếng

- **WHEN** người dùng tắt tiếng nhóm X rồi chủ nhóm X gửi một thông báo
- **THEN** thông báo nằm trong hộp thư của họ và không được nhắc

#### Scenario: Chuyện về chính mình vẫn được nhắc

- **WHEN** người dùng tắt tiếng nhóm X rồi được bổ nhiệm làm điều hành viên của X
- **THEN** thông báo về việc bổ nhiệm được nhắc

#### Scenario: Nhóm khác không bị ảnh hưởng

- **WHEN** người dùng tắt tiếng nhóm X rồi chủ nhóm Y của họ gửi thông báo
- **THEN** thông báo của nhóm Y được nhắc

#### Scenario: Tắt tiếng nhóm mình không ở

- **WHEN** người dùng tắt tiếng một nhóm mà mình không phải thành viên
- **THEN** response có HTTP 409 `NOT_GROUP_MEMBER`
