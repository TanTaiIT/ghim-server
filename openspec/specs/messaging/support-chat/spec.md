# messaging/support-chat Specification

## Purpose

Cho mỗi người dùng một hội thoại với đội Hỗ trợ Ghim, mọi staff có quyền hỗ trợ cùng trả lời từ bàn vận hành mà
người dùng chỉ thấy "Hỗ trợ Ghim" — staff là quyền gắn lên tài khoản cá nhân, lộ tài khoản là lộ người (TK 5, TK 24).

## Requirements

### Requirement: Mỗi người dùng một hội thoại với Hỗ trợ Ghim

Người dùng đã đăng nhập, đã xác nhận email SHALL mở được hội thoại với Hỗ trợ Ghim từ app. Mỗi người dùng MUST có tối
đa một hội thoại hỗ trợ: mở lại thì vào hội thoại cũ, kể cả khi đã xoá nó ở phía mình. Tài khoản master MUST NOT mở
hội thoại hỗ trợ (chốt 18/10/2026).

#### Scenario: Mở lần đầu

- **WHEN** một người dùng chưa từng nhắn hỗ trợ mở hội thoại với Hỗ trợ Ghim
- **THEN** response có HTTP 201 và hội thoại mới có hai bên: người dùng đó và Hỗ trợ Ghim

#### Scenario: Mở lại

- **WHEN** người dùng đã có hội thoại hỗ trợ mở hội thoại với Hỗ trợ Ghim lần nữa
- **THEN** response có HTTP 200 với đúng hội thoại cũ cùng mọi tin nhắn cũ

#### Scenario: Mở lại sau khi đã xoá phía mình

- **WHEN** người dùng đã xoá hội thoại hỗ trợ ở phía mình rồi mở hội thoại với Hỗ trợ Ghim
- **THEN** hội thoại cũ hiện lại trong danh sách của người dùng với đủ tin nhắn cũ, không có hội thoại thứ hai

#### Scenario: Hai yêu cầu mở cùng lúc

- **WHEN** người dùng gửi hai yêu cầu mở hội thoại hỗ trợ cùng một lúc
- **THEN** người dùng có đúng một hội thoại hỗ trợ

#### Scenario: Chưa xác nhận email

- **WHEN** một tài khoản chưa xác nhận email mở hội thoại với Hỗ trợ Ghim
- **THEN** response có HTTP 403 `EMAIL_NOT_VERIFIED` và không hội thoại nào được tạo

#### Scenario: Khách chưa đăng nhập

- **WHEN** khách chưa đăng nhập mở hội thoại với Hỗ trợ Ghim
- **THEN** response có HTTP 401 `UNAUTHORIZED`

#### Scenario: Tài khoản master

- **WHEN** tài khoản master mở hội thoại với Hỗ trợ Ghim
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Không tính hạn mức hội thoại mới

- **WHEN** người dùng T0 đã mở 10 hội thoại mới về tin trong ngày rồi mở hội thoại hỗ trợ lần đầu
- **THEN** hội thoại hỗ trợ được tạo

### Requirement: Người dùng thấy Hỗ trợ Ghim, không thấy staff

Tin nhắn của đội hỗ trợ tới người dùng SHALL ký "Hỗ trợ Ghim". Người dùng MUST NOT thấy tên, mã tài khoản hay bất cứ
dấu nào cho biết staff nào đã viết.

#### Scenario: Staff trả lời

- **WHEN** một staff hỗ trợ trả lời trong hội thoại hỗ trợ của người dùng
- **THEN** người dùng thấy tin nhắn đó từ "Hỗ trợ Ghim", không kèm tên hay mã tài khoản của staff

#### Scenario: Hai staff cùng trả lời

- **WHEN** hai staff hỗ trợ khác nhau lần lượt trả lời cùng một hội thoại
- **THEN** người dùng thấy cả hai tin nhắn cùng từ "Hỗ trợ Ghim"

### Requirement: Staff hỗ trợ trả lời từ bàn vận hành

Tài khoản mang quyền staff "hỗ trợ người dùng" SHALL xem được hàng hội thoại hỗ trợ — hội thoại đang chờ đội trả lời
trước, chờ lâu nhất trước — đọc được mọi tin nhắn và trả lời được, từ bàn vận hành. Người trong đội thấy staff nào đã
viết từng tin. Tài khoản không mang quyền đó MUST NOT xem hay trả lời. Staff MUST NOT trả lời hội thoại hỗ trợ của chính
tài khoản mình (cam kết 1).

#### Scenario: Hàng đang chờ

- **WHEN** người dùng A nhắn hỗ trợ lúc 9 giờ, người dùng B lúc 10 giờ, và đội đã trả lời B lúc 10 giờ 5
- **THEN** hàng của staff hỗ trợ có A ở nhóm đang chờ trả lời, B ở nhóm đã trả lời

#### Scenario: Staff trả lời

- **WHEN** staff hỗ trợ trả lời một hội thoại đang chờ
- **THEN** response có HTTP 201, hội thoại rời nhóm đang chờ, và người dùng thấy tin nhắn trong hội thoại của mình

#### Scenario: Người dùng nhắn tiếp

- **WHEN** đội đã trả lời và người dùng gửi thêm một tin nhắn
- **THEN** hội thoại về lại nhóm đang chờ trả lời, tính chờ từ tin nhắn đó

#### Scenario: Người không có quyền hỗ trợ

- **WHEN** một tài khoản staff chỉ mang quyền duyệt giấy tờ xem hàng hội thoại hỗ trợ
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Staff trả lời hội thoại của chính mình

- **WHEN** một staff hỗ trợ đã nhắn hỗ trợ bằng tài khoản của mình, rồi trả lời hội thoại đó từ bàn vận hành
- **THEN** response có HTTP 403 `FORBIDDEN` và hội thoại vẫn chờ một staff khác

#### Scenario: Staff bị treo quyền

- **WHEN** quyền staff của một tài khoản bị treo vì nhận gậy, rồi tài khoản đó xem hàng hội thoại hỗ trợ
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Staff đi qua app

- **WHEN** một staff hỗ trợ mở hội thoại hỗ trợ của người khác qua route hội thoại của app
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Người dùng đã xoá tài khoản

- **WHEN** người dùng xoá tài khoản sau khi đã nhắn hỗ trợ
- **THEN** staff hỗ trợ vẫn đọc được hội thoại, cho biết người dùng đã rời Ghim, và không gửi được tin nhắn mới

#### Scenario: Tin nhắn rỗng

- **WHEN** staff hỗ trợ gửi tin nhắn không có nội dung
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không tin nhắn nào được thêm
