## ADDED Requirements

### Requirement: Mời lại khi lời mời còn chờ

Mời lại một email đang có lời mời chờ trong nhóm SHALL không tạo lời mời thứ hai: lời mời đang chờ lấy đơn vị của lượt
mời mới và giữ hạn cũ (chốt 16/10/2026).

#### Scenario: Mời lại với đơn vị khác

- **WHEN** chủ nhóm mời An vào lớp 12A1, rồi khi lời mời còn chờ, mời lại An vào lớp 12A2, và An nhận lời
- **THEN** An là thành viên thuộc lớp 12A2, và nhóm chỉ có một lời mời chờ cho An trước lúc nhận

### Requirement: Danh sách lời mời đang chờ

Chủ nhóm, điều hành viên hoặc master SHALL xem được các lời mời đang chờ của nhóm: email đã che (ký tự đầu và miền),
đơn vị, lúc mời, hạn — đủ để thu hồi một lời mời gửi nhầm. Mỗi lượt mời MUST có đúng một dòng như nhau dù email có
thuộc tài khoản nào, đã ở nhóm hay không, để danh sách không lộ email nào đã có tài khoản (TK 10). Điều hành viên đơn
vị con chỉ thấy lời mời vào đơn vị mình.

#### Scenario: Xem rồi thu hồi lời mời gửi nhầm

- **WHEN** chủ nhóm mời nhầm `binh@truong.vn`, xem danh sách lời mời, rồi thu hồi dòng `b***@truong.vn`
- **THEN** dòng đó có trong danh sách với đơn vị và hạn, thu hồi trả HTTP 204, và Bình không còn lời mời nào

#### Scenario: Email chưa có tài khoản cũng có một dòng

- **WHEN** chủ nhóm mời một email có tài khoản và một email chưa có tài khoản
- **THEN** danh sách có hai dòng cùng các trường như nhau, không trường nào cho biết email nào đã có tài khoản

#### Scenario: Điều hành viên đơn vị chỉ thấy đơn vị mình

- **WHEN** nhóm có lời mời vào lớp 12A1 và lớp 12A2, điều hành viên phụ trách lớp 12A1 xem danh sách
- **THEN** chỉ thấy lời mời vào lớp 12A1

#### Scenario: Thành viên thường xem danh sách lời mời

- **WHEN** một thành viên không có vai xem danh sách lời mời
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Danh sách người bị cấm

Chủ nhóm, điều hành viên cả nhóm hoặc master SHALL xem được những người đang bị cấm khỏi nhóm — tên hiển thị, lúc cấm,
người cấm — để gỡ cấm được trên app.

#### Scenario: Xem rồi gỡ cấm

- **WHEN** chủ nhóm cấm Bình, xem danh sách người bị cấm, rồi gỡ cấm Bình
- **THEN** Bình có trong danh sách kèm lúc cấm, gỡ cấm trả HTTP 204, và Bình không còn trong danh sách

#### Scenario: Điều hành viên đơn vị xem danh sách người bị cấm

- **WHEN** điều hành viên phụ trách lớp 12A1 xem danh sách người bị cấm
- **THEN** response có HTTP 403 `FORBIDDEN`
