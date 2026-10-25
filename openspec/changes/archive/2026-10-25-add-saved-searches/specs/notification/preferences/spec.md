## MODIFIED Requirements

### Requirement: Bật tắt từng nhóm thông báo

Người dùng SHALL xem được trạng thái bật / tắt của cả mười nhóm thông báo và SHALL bật hoặc tắt được riêng từng
nhóm, trừ nhóm "tài khoản". Thông báo thuộc nhóm đang tắt MUST vẫn vào hộp thư nhưng không được nhắc.

#### Scenario: Xem cài đặt thông báo

- **WHEN** người dùng mở cài đặt thông báo
- **THEN** response có HTTP 200 với đủ mười nhóm và trạng thái bật / tắt của từng nhóm

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

- **WHEN** người dùng bật hay tắt một nhóm không thuộc mười nhóm
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

### Requirement: Nhóm "tài khoản" luôn bật

Nhóm "tài khoản" MUST luôn bật, kể cả với tài khoản vừa lập; người dùng không tắt được nhóm này.

#### Scenario: Tắt nhóm "tài khoản"

- **WHEN** người dùng tắt nhóm "tài khoản"
- **THEN** response có HTTP 400 `NOTIFICATION_GROUP_ALWAYS_ON` và nhóm "tài khoản" vẫn bật

#### Scenario: Tài khoản vừa lập

- **WHEN** một tài khoản vừa tạo mở cài đặt thông báo
- **THEN** cả mười nhóm đang bật
