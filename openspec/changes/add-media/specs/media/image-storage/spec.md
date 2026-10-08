## Purpose

Giữ mọi ảnh của Ghim trong kho của chính hệ thống, có chủ ngay từ lúc tải và không đổi được ruột sau khi
tải, để điều người duyệt đã xem luôn đúng là điều người mua thấy (TK 25).

## ADDED Requirements

### Requirement: Xin tải ảnh cho một chủ của mình

Người dùng đã đăng nhập SHALL xin được quyền tải ảnh thẳng vào kho của hệ thống cho một chủ của chính mình:
một tin của mình — kể cả tin còn là nháp — hoặc hồ sơ của mình. Quyền tải cấp cho đúng người xin, và ảnh tải
lên thuộc về chủ đã nêu ngay từ lúc tải.

#### Scenario: Xin tải ảnh cho nháp của mình

- **WHEN** người dùng xin tải một ảnh cho nháp của mình
- **THEN** response có HTTP 201 kèm quyền tải lên cho đúng một ảnh, và ảnh tải xong thuộc về nháp đó

#### Scenario: Khách chưa đăng nhập

- **WHEN** khách chưa đăng nhập xin tải ảnh
- **THEN** response có HTTP 401 `UNAUTHORIZED`

#### Scenario: Nháp của người khác

- **WHEN** người dùng xin tải ảnh cho một nháp không phải của mình
- **THEN** response có HTTP 404 `NOT_FOUND`, không lộ nháp đó có tồn tại hay không

#### Scenario: Tệp không phải ảnh

- **WHEN** người dùng xin tải một tệp khai là văn bản, không phải ảnh
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không có quyền tải nào được cấp

### Requirement: Ảnh đã tải không bị ghi đè

Mỗi quyền tải lên SHALL chỉ dùng được cho đúng một ảnh. Ảnh đã nằm trong kho MUST NOT bị ghi đè nội dung —
muốn đổi ảnh thì tải ảnh mới — để không ai đổi được ruột ảnh sau khi tin đã qua duyệt.

#### Scenario: Dùng lại quyền tải để thay ruột ảnh

- **WHEN** người dùng dùng lại quyền tải của một ảnh đã tải xong để tải một nội dung khác
- **THEN** lượt tải bị từ chối và ảnh trong kho giữ nguyên nội dung cũ

#### Scenario: Đổi ảnh của nháp

- **WHEN** người dùng thay một ảnh trong nháp bằng ảnh khác rồi lưu nháp
- **THEN** ảnh thay vào là một ảnh mới tải vào kho, và nội dung ảnh cũ trong kho không đổi

### Requirement: Chỉ nhận ảnh nằm trong kho

Khi lưu một nháp, một tin hay một hồ sơ, mọi ảnh SHALL là ảnh nằm trong kho của hệ thống do chính người lưu
tải lên. Đường link tới ảnh ngoài kho, và ảnh chưa tải xong, MUST bị từ chối. Ảnh của người khác MUST bị từ
chối giống hệt ảnh không tồn tại.

#### Scenario: Ảnh từ đường link ngoài kho

- **WHEN** người dùng lưu nháp với một ảnh là đường link tới một trang khác
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE` và nháp giữ nguyên như trước lần lưu

#### Scenario: Ảnh chưa tải xong

- **WHEN** người dùng lưu nháp với một ảnh đã xin quyền tải nhưng chưa tải lên kho
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE`

#### Scenario: Ảnh do người khác tải lên

- **WHEN** người dùng lưu nháp với mã của một ảnh do tài khoản khác tải lên
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE`, giống hệt trường hợp mã ảnh không tồn tại

#### Scenario: Ảnh của chính mình trong kho

- **WHEN** người dùng lưu nháp với ảnh mình đã tải xong cho nháp đó
- **THEN** nháp được lưu cùng ảnh đó

### Requirement: Ngoại lệ duy nhất là ảnh đại diện lấy từ Google

Ảnh đại diện lấy từ tài khoản Google mà người dùng dùng để đăng nhập SHALL được nhận dù không nằm trong kho.
Đây là ngoại lệ duy nhất: mọi ảnh khác ngoài kho MUST bị từ chối, kể cả ảnh đại diện từ nguồn khác.

#### Scenario: Ảnh đại diện từ tài khoản Google

- **WHEN** người dùng đăng nhập bằng Google dùng ảnh đại diện của tài khoản Google đó làm ảnh đại diện
- **THEN** hồ sơ được lưu với ảnh đó dù ảnh không nằm trong kho

#### Scenario: Ảnh đại diện từ trang khác

- **WHEN** người dùng đặt ảnh đại diện bằng đường link tới một trang không phải kho của hệ thống
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE`

#### Scenario: Ảnh Google dùng cho tin đăng

- **WHEN** người dùng lưu nháp với ảnh là ảnh đại diện Google của mình
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE` vì ngoại lệ chỉ dành cho ảnh đại diện

### Requirement: Nhãn "chưa xác nhận"

Ảnh mới tải SHALL mang nhãn "chưa xác nhận". Nhãn SHALL được gỡ ngay khi chủ của ảnh được lưu thành công
cùng ảnh đó; lần lưu thất bại MUST NOT gỡ nhãn.

#### Scenario: Ảnh vừa tải

- **WHEN** người dùng tải xong một ảnh cho nháp nhưng chưa lưu nháp
- **THEN** ảnh mang nhãn "chưa xác nhận"

#### Scenario: Lưu nháp thành công

- **WHEN** người dùng lưu nháp thành công với ảnh vừa tải
- **THEN** ảnh hết mang nhãn "chưa xác nhận"

#### Scenario: Lưu nháp thất bại

- **WHEN** người dùng lưu nháp với ảnh vừa tải nhưng lần lưu bị từ chối với HTTP 400 `VALIDATION_ERROR`
- **THEN** ảnh vẫn mang nhãn "chưa xác nhận"
