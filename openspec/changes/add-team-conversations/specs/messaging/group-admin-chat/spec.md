## ADDED Requirements

### Requirement: Mỗi người dùng một hội thoại với quản trị một nhóm

Người dùng đã đăng nhập, đã xác nhận email, xem được hồ sơ của một nhóm SHALL mở được hội thoại với quản trị nhóm đó.
Mỗi người dùng và một nhóm MUST có tối đa một hội thoại: mở lại thì vào hội thoại cũ. Người đang bị cấm khỏi nhóm,
người đang là chủ nhóm hay điều hành viên của nhóm, và tài khoản master MUST NOT mở hội thoại mới với quản trị nhóm đó
(chốt 18/10/2026).

#### Scenario: Thành viên nhắn quản trị

- **WHEN** một thành viên mở hội thoại với quản trị nhóm của mình lần đầu
- **THEN** response có HTTP 201 và hội thoại mới có hai bên: thành viên đó và quản trị nhóm

#### Scenario: Người ngoài nhắn quản trị nhóm công khai

- **WHEN** một người không phải thành viên mở hội thoại với quản trị của một nhóm công khai
- **THEN** response có HTTP 201

#### Scenario: Người ngoài nhắn quản trị nhóm riêng tư

- **WHEN** một người không phải thành viên mở hội thoại với quản trị của một nhóm riêng tư mà họ chỉ thấy được tên
- **THEN** response có HTTP 201 — xem được hồ sơ nhóm, dù chỉ là tên, là nhắn được

#### Scenario: Mở lại

- **WHEN** người dùng đã có hội thoại với quản trị nhóm X mở hội thoại với quản trị nhóm X lần nữa
- **THEN** response có HTTP 200 với đúng hội thoại cũ

#### Scenario: Hai yêu cầu mở cùng lúc

- **WHEN** người dùng gửi hai yêu cầu mở hội thoại với quản trị cùng một nhóm cùng một lúc
- **THEN** người dùng có đúng một hội thoại với quản trị nhóm đó

#### Scenario: Người bị cấm khỏi nhóm

- **WHEN** người đang bị cấm khỏi nhóm X mở hội thoại với quản trị nhóm X
- **THEN** response có HTTP 403 `GROUP_BANNED` và không hội thoại nào được tạo

#### Scenario: Quản trị nhắn nhóm của chính mình

- **WHEN** chủ nhóm hay một điều hành viên của nhóm X mở hội thoại với quản trị nhóm X
- **THEN** response có HTTP 403 `CANNOT_MESSAGE_OWN_GROUP`

#### Scenario: Nhóm không còn hoạt động

- **WHEN** người dùng mở hội thoại với quản trị của một nhóm đã đóng hay đang tạm khoá
- **THEN** response có HTTP 409 `GROUP_NOT_ACTIVE` và không hội thoại nào được tạo

#### Scenario: Nhóm không tồn tại

- **WHEN** người dùng mở hội thoại với quản trị của một mã nhóm không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Chưa xác nhận email

- **WHEN** một tài khoản chưa xác nhận email mở hội thoại với quản trị một nhóm
- **THEN** response có HTTP 403 `EMAIL_NOT_VERIFIED`

#### Scenario: Không tính hạn mức hội thoại mới

- **WHEN** người dùng T0 đã hết lượt hội thoại mới về tin trong ngày rồi mở hội thoại với quản trị một nhóm lần đầu
- **THEN** hội thoại được tạo

### Requirement: Mọi quản trị của nhóm cùng thấy một hội thoại

Chủ nhóm và mọi điều hành viên đang giữ vai của nhóm SHALL thấy hội thoại của người dùng với quản trị nhóm trong danh
sách hội thoại của mình, đọc được mọi tin nhắn và trả lời được. Ai mất vai — bị gỡ, tự rời, hay vai bị tạm treo — MUST
mất quyền vào hội thoại ngay; người được giao vai sau thấy cả tin nhắn cũ. Người trong đội thấy quản trị nào viết
từng tin.

#### Scenario: Hai quản trị cùng thấy

- **WHEN** người dùng nhắn quản trị nhóm X, nhóm có chủ nhóm và một điều hành viên
- **THEN** cả hai thấy hội thoại đó trong danh sách hội thoại của mình, cùng tin nhắn của người dùng

#### Scenario: Điều hành viên trả lời

- **WHEN** điều hành viên trả lời trong hội thoại
- **THEN** response có HTTP 201, người dùng thấy tin nhắn, và chủ nhóm thấy tin nhắn kèm tên điều hành viên đã viết

#### Scenario: Điều hành viên bị gỡ vai

- **WHEN** một điều hành viên bị gỡ vai rồi mở hội thoại của người dùng với quản trị nhóm
- **THEN** response có HTTP 404 `NOT_FOUND`, và hội thoại không còn trong danh sách của người đó

#### Scenario: Vai bị tạm treo

- **WHEN** điều hành viên tạm mất vai vì nhận gậy nặng, rồi gửi tin trong hội thoại với quản trị nhóm
- **THEN** response có HTTP 404 `NOT_FOUND` và không tin nhắn nào được thêm

#### Scenario: Điều hành viên mới

- **WHEN** một thành viên được giao vai điều hành viên sau khi hội thoại đã có tin nhắn
- **THEN** người đó thấy hội thoại cùng mọi tin nhắn cũ

#### Scenario: Nhóm chưa có ai quản trị

- **WHEN** nhóm X tạm thời chưa có chủ và chưa có điều hành viên, và người dùng nhắn quản trị nhóm X
- **THEN** tin nhắn được gửi và chờ tới khi nhóm có người quản trị

### Requirement: Người dùng thấy tên nhóm, không thấy quản trị nào viết

Tin nhắn của quản trị tới người dùng SHALL ký "Quản trị nhóm «tên nhóm»", như các quyết định của nhóm (TK 24). Người
dùng MUST NOT thấy tên, mã tài khoản hay dấu nào cho biết quản trị nào đã viết.

#### Scenario: Chủ nhóm trả lời

- **WHEN** chủ nhóm "Hội Nhiếp ảnh Sài Gòn" trả lời người dùng
- **THEN** người dùng thấy tin nhắn từ "Quản trị nhóm «Hội Nhiếp ảnh Sài Gòn»", không kèm tên hay mã tài khoản của chủ
  nhóm

#### Scenario: Nhóm đổi tên

- **WHEN** nhóm đổi tên sau khi đã có hội thoại
- **THEN** người dùng thấy hội thoại và các tin nhắn cũ dưới tên mới của nhóm

### Requirement: Hội thoại khi nhóm đóng hay người dùng bị cấm

Hội thoại với quản trị một nhóm SHALL tiếp tục khi người dùng rời nhóm hay nhóm tạm khoá. Khi nhóm đóng, hội thoại MUST
chỉ còn để đọc với cả hai bên. Khi người dùng bị cấm khỏi nhóm, người dùng MUST NOT gửi tin nhắn mới trong hội thoại
đó; tin nhắn cũ vẫn đọc được với cả hai bên.

#### Scenario: Người dùng rời nhóm

- **WHEN** thành viên rời nhóm sau khi đã nhắn quản trị nhóm
- **THEN** hai bên vẫn gửi và nhận tin nhắn trong hội thoại đó

#### Scenario: Nhóm đóng

- **WHEN** nhóm đóng khi đang có hội thoại với quản trị
- **THEN** cả người dùng lẫn quản trị gửi tin nhận HTTP 409 `CONVERSATION_CLOSED`, và cả hai vẫn đọc được tin nhắn cũ

#### Scenario: Người dùng bị cấm

- **WHEN** người dùng bị cấm khỏi nhóm sau khi đã nhắn quản trị, rồi gửi tin trong hội thoại đó
- **THEN** response có HTTP 403 `GROUP_BANNED` và không tin nhắn nào được thêm

#### Scenario: Quản trị trả lời người đã bị cấm

- **WHEN** quản trị gửi tin trong hội thoại với một người dùng đang bị cấm khỏi nhóm
- **THEN** response có HTTP 409 `CONVERSATION_CLOSED`
