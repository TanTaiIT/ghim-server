## Purpose

Cho người dùng tự chọn nhóm thông báo nào được làm phiền mình trên điện thoại, trừ thông báo về tài khoản luôn
phải tới (TK 24).

## ADDED Requirements

### Requirement: Bật tắt từng nhóm thông báo

Người dùng SHALL xem được trạng thái bật / tắt của cả chín nhóm thông báo và SHALL bật hoặc tắt được riêng từng
nhóm, trừ nhóm "tài khoản". Thông báo thuộc nhóm đang tắt MUST NOT hiện lên màn hình điện thoại.

#### Scenario: Xem cài đặt thông báo

- **WHEN** người dùng mở cài đặt thông báo
- **THEN** response có HTTP 200 với đủ chín nhóm và trạng thái bật / tắt của từng nhóm

#### Scenario: Tắt một nhóm

- **WHEN** người dùng tắt nhóm "tin mới trong nhóm" rồi một tin mới hiện trên bảng tin nhóm của họ
- **THEN** không có thông báo nào về tin đó hiện lên màn hình điện thoại của họ

#### Scenario: Tắt nhóm này không ảnh hưởng nhóm khác

- **WHEN** người dùng đã cho phép hiện thông báo trên điện thoại, tắt nhóm "tin nhắn", rồi có thông báo nhóm
  "tin đăng của bạn" gửi tới
- **THEN** thông báo nhóm "tin đăng của bạn" vẫn hiện lên màn hình điện thoại

#### Scenario: Bật lại

- **WHEN** người dùng bật lại nhóm "tin nhắn" đã tắt trước đó
- **THEN** thông báo nhóm "tin nhắn" gửi tới sau lúc bật lại hiện lên màn hình điện thoại như thường

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
- **THEN** nhóm "tài khoản" đang bật
