## Purpose

Cho người dùng soạn một tin trước khi gửi — nội dung, nơi đăng, tối đa 6 ảnh — mà chưa ai khác thấy và chưa
phải đủ mọi điều kiện gửi (TK 3, TK 12, TK 18).

## ADDED Requirements

### Requirement: Tạo nháp

Người dùng đã đăng nhập SHALL tạo được nháp. Nháp chỉ chủ nháp xem và sửa được — với mọi người khác, nháp MUST
như không tồn tại.

#### Scenario: Tạo nháp thành công

- **WHEN** người dùng đã đăng nhập tạo nháp
- **THEN** response có HTTP 201 và tin mới ở trạng thái nháp

#### Scenario: Khách chưa đăng nhập

- **WHEN** khách chưa đăng nhập tạo nháp
- **THEN** response có HTTP 401 `UNAUTHORIZED`

#### Scenario: Người khác mở nháp

- **WHEN** một người dùng khác mở hoặc sửa nháp của người đăng
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Tài khoản master không đăng tin

Tài khoản master MUST NOT tạo nháp. Người làm master muốn bán đồ thì dùng tài khoản cá nhân như mọi người;
tài khoản mang quyền staff vẫn là tài khoản cá nhân nên đăng tin bình thường (TK 5).

#### Scenario: Master tạo nháp

- **WHEN** tài khoản master tạo nháp
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Tài khoản mang quyền staff tạo nháp

- **WHEN** tài khoản mang quyền staff tạo nháp
- **THEN** nháp được tạo như với mọi người dùng

### Requirement: Nháp lưu được khi chưa đủ thông tin

Nháp SHALL lưu được khi còn thiếu thông tin — chưa có giá, chưa chọn nơi đăng, chưa có khu vực. Thông tin đã đủ
hay chưa chỉ được xét lúc gửi.

#### Scenario: Lưu nháp dở

- **WHEN** người dùng lưu nháp chỉ có tiêu đề, chưa có giá, nơi đăng hay khu vực
- **THEN** nháp được lưu và vẫn ở trạng thái nháp

#### Scenario: Gửi nháp còn thiếu

- **WHEN** người dùng gửi chính nháp đó khi chưa chọn nơi đăng
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và nháp vẫn là nháp

### Requirement: Tối đa 6 ảnh, ảnh đầu là ảnh bìa

Mỗi tin SHALL có tối đa 6 ảnh (giá trị khởi đầu), ở nháp cũng như khi sửa tin đã gửi. Ảnh xếp theo thứ tự người
đăng chọn; ảnh đứng đầu là ảnh bìa, nên đổi thứ tự là đổi ảnh bìa.

#### Scenario: Ảnh thứ sáu

- **WHEN** người dùng thêm ảnh thứ 6 vào nháp đang có 5 ảnh
- **THEN** nháp có 6 ảnh

#### Scenario: Ảnh thứ bảy

- **WHEN** người dùng thêm ảnh thứ 7 vào nháp đang có 6 ảnh
- **THEN** response có HTTP 400 `TOO_MANY_IMAGES` và nháp vẫn giữ 6 ảnh cũ

#### Scenario: Đổi thứ tự ảnh

- **WHEN** người dùng chuyển ảnh thứ ba lên đầu
- **THEN** ảnh đó thành ảnh bìa của tin

#### Scenario: Sửa tin đã gửi lên bảy ảnh

- **WHEN** người đăng sửa một tin đang hiển thị có 6 ảnh và thêm ảnh thứ 7
- **THEN** response có HTTP 400 `TOO_MANY_IMAGES` và tin không đổi

### Requirement: Ảnh của nháp nằm trong kho và thuộc về chính nháp

Người dùng SHALL xin được quyền tải ảnh cho nháp của mình qua `media/image-storage`; ảnh thuộc về nháp ngay từ lúc
tải. Lưu nháp hay tin SHALL chỉ nhận ảnh nằm trong kho do chính người lưu tải cho đúng nháp đó (luật chung ở
`media/image-storage`); ảnh Google chỉ là ngoại lệ cho ảnh đại diện. Lưu nhận ảnh thì gỡ nhãn "chưa xác nhận"; lưu
bị từ chối thì không.

#### Scenario: Xin tải ảnh cho nháp của mình

- **WHEN** người dùng xin tải một ảnh cho nháp của mình
- **THEN** response có HTTP 201 kèm quyền tải lên cho đúng một ảnh, và ảnh tải xong thuộc về nháp đó

#### Scenario: Xin tải ảnh cho nháp của người khác

- **WHEN** người dùng xin tải ảnh cho một nháp không phải của mình
- **THEN** response có HTTP 404 `NOT_FOUND`, không lộ nháp đó có tồn tại hay không

#### Scenario: Ảnh từ đường link ngoài kho

- **WHEN** người dùng lưu nháp với một ảnh là đường link tới một trang khác
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE` và nháp giữ nguyên như trước lần lưu

#### Scenario: Ảnh chưa tải xong

- **WHEN** người dùng lưu nháp với một ảnh đã xin quyền tải nhưng chưa tải lên kho
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE`

#### Scenario: Ảnh do người khác tải lên

- **WHEN** người dùng lưu nháp với mã của một ảnh do tài khoản khác tải lên
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE`, giống hệt trường hợp mã ảnh không tồn tại

#### Scenario: Ảnh tải cho nháp khác

- **WHEN** người dùng lưu nháp với một ảnh mình đã tải cho một nháp khác của mình
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE` — ảnh không dùng lại giữa các nháp

#### Scenario: Ảnh Google dùng cho tin đăng

- **WHEN** người dùng lưu nháp với ảnh là ảnh đại diện Google của mình
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE` vì ngoại lệ chỉ dành cho ảnh đại diện

#### Scenario: Ảnh của chính nháp trong kho

- **WHEN** người dùng lưu nháp với ảnh mình đã tải xong cho nháp đó
- **THEN** nháp được lưu cùng ảnh đó và ảnh hết mang nhãn "chưa xác nhận"

#### Scenario: Lưu nháp thất bại

- **WHEN** người dùng lưu nháp với ảnh vừa tải nhưng lần lưu bị từ chối với HTTP 400 `VALIDATION_ERROR`
- **THEN** ảnh vẫn mang nhãn "chưa xác nhận"

#### Scenario: Đổi ảnh của nháp

- **WHEN** người dùng thay một ảnh trong nháp bằng ảnh khác rồi lưu nháp
- **THEN** ảnh thay vào là một ảnh mới tải vào kho, và nội dung ảnh cũ trong kho không đổi
