## Purpose

Cho một người tạo tài khoản Ghim bằng email kèm mật khẩu, hoặc bằng Google, với đúng một tài khoản cho mỗi
email và không dùng SMS ở bất kỳ bước nào (TK 7).

## ADDED Requirements

### Requirement: Đăng ký bằng email và mật khẩu

Người dùng SHALL tạo được tài khoản bằng email và mật khẩu. Tài khoản mới ở trạng thái "chưa xác nhận",
và hệ thống gửi một mã xác nhận tới email đó.

#### Scenario: Đăng ký thành công

- **WHEN** khách gửi một email chưa có tài khoản cùng mật khẩu hợp lệ
- **THEN** response có HTTP 201, tài khoản ở trạng thái chưa xác nhận và một mã xác nhận được gửi tới email

#### Scenario: Thiếu email

- **WHEN** khách gửi yêu cầu đăng ký không có email
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

### Requirement: Không dùng SMS, số điện thoại không bắt buộc

Đăng ký SHALL không đòi số điện thoại, và hệ thống MUST NOT gửi SMS ở bất kỳ bước nào của việc tạo hay xác
nhận tài khoản.

#### Scenario: Đăng ký không có số điện thoại

- **WHEN** khách đăng ký chỉ với email và mật khẩu
- **THEN** tài khoản được tạo và không có SMS nào được gửi

### Requirement: Xác nhận email bằng mã

Mã xác nhận SHALL có hiệu lực 10 phút (giá trị khởi đầu). Nhập đúng mã còn hạn thì tài khoản chuyển sang
"đã xác nhận". Nhập sai 5 lần (giá trị khởi đầu) thì mã bị huỷ.

#### Scenario: Nhập đúng mã còn hạn

- **WHEN** người dùng nhập đúng mã trong vòng 10 phút
- **THEN** response có HTTP 200 và tài khoản chuyển sang đã xác nhận

#### Scenario: Mã quá hạn

- **WHEN** người dùng nhập đúng mã sau 10 phút
- **THEN** response có HTTP 400 `CODE_EXPIRED` và tài khoản vẫn chưa xác nhận

#### Scenario: Nhập sai mã

- **WHEN** người dùng nhập sai mã lần thứ nhất
- **THEN** response có HTTP 400 `CODE_INVALID`

#### Scenario: Sai quá số lần cho phép

- **WHEN** người dùng nhập sai lần thứ 5 rồi nhập đúng mã cũ
- **THEN** lần thứ 5 nhận HTTP 400 `CODE_INVALID`, mã bị huỷ, và lần nhập đúng sau đó nhận HTTP 400
  `CODE_EXPIRED`

### Requirement: Gửi lại mã xác nhận

Người dùng SHALL xin gửi lại mã được, cách lần gửi trước ít nhất 60 giây (giá trị khởi đầu). Gửi mã mới thì
mã cũ hết hiệu lực.

#### Scenario: Xin gửi lại quá sớm

- **WHEN** người dùng xin gửi lại mã sau 30 giây
- **THEN** response có HTTP 429 `RESEND_TOO_SOON` kèm thời điểm được xin lại

#### Scenario: Mã cũ hết hiệu lực khi có mã mới

- **WHEN** người dùng xin mã mới sau 60 giây rồi nhập mã cũ
- **THEN** response có HTTP 400 `CODE_INVALID`

### Requirement: Đăng ký và đăng nhập bằng Google

Người dùng SHALL tạo được tài khoản bằng Google; email do Google xác thực được coi là đã xác nhận, không
cần mã. Email đó đã có tài khoản thì người dùng vào chính tài khoản ấy, không sinh tài khoản thứ hai.

#### Scenario: Lần đầu dùng Google

- **WHEN** khách đăng nhập bằng Google với một email chưa có tài khoản
- **THEN** một tài khoản mới được tạo ở trạng thái đã xác nhận

#### Scenario: Email đã có tài khoản

- **WHEN** khách đăng nhập bằng Google với email trùng (sau chuẩn hoá) một tài khoản đã có
- **THEN** khách vào đúng tài khoản đã có và hệ thống vẫn chỉ có một tài khoản cho email đó

### Requirement: Mỗi email một tài khoản, so sau khi chuẩn hoá

Hệ thống SHALL chuẩn hoá email trước khi so trùng: đổi về chữ thường; bỏ phần từ dấu "+" tới trước "@";
với Gmail bỏ mọi dấu chấm ở phần tên và coi `googlemail.com` là `gmail.com`. Email trùng một tài khoản đã
có sau chuẩn hoá MUST bị từ chối.

#### Scenario: Thêm "+tag" vào email đã có

- **WHEN** `lan@gmail.com` đã có tài khoản và khách đăng ký `lan+2@gmail.com`
- **THEN** response có HTTP 409 `EMAIL_TAKEN`

#### Scenario: Thêm dấu chấm vào Gmail

- **WHEN** `lanhoang@gmail.com` đã có tài khoản và khách đăng ký `lan.hoang@googlemail.com`
- **THEN** response có HTTP 409 `EMAIL_TAKEN`

#### Scenario: Khác chữ hoa chữ thường

- **WHEN** `minh@ghim.vn` đã có tài khoản và khách đăng ký `Minh@Ghim.VN`
- **THEN** response có HTTP 409 `EMAIL_TAKEN`

#### Scenario: Dấu chấm ở miền không phải Gmail vẫn có nghĩa

- **WHEN** `lanhoang@ghim.vn` đã có tài khoản và khách đăng ký `lan.hoang@ghim.vn`
- **THEN** tài khoản mới được tạo

### Requirement: Chặn email dùng một lần

Email thuộc danh sách miền email dùng một lần SHALL bị từ chối khi đăng ký. Master SHALL cập nhật được danh
sách này mà không cần phát hành lại phần mềm.

#### Scenario: Đăng ký bằng email tạm

- **WHEN** khách đăng ký bằng một email thuộc miền trong danh sách dùng một lần
- **THEN** response có HTTP 400 `EMAIL_DISPOSABLE`

#### Scenario: Master thêm một miền mới

- **WHEN** master thêm một miền vào danh sách
- **THEN** lượt đăng ký kế tiếp bằng email thuộc miền đó bị từ chối với HTTP 400 `EMAIL_DISPOSABLE`

### Requirement: Dọn đăng ký dở dang

Tài khoản chưa xác nhận quá 7 ngày (giá trị khởi đầu) SHALL bị xoá hẳn, để email đó đăng ký lại được.

#### Scenario: Bỏ dở quá hạn

- **WHEN** một tài khoản chưa xác nhận đã được tạo hơn 7 ngày
- **THEN** tài khoản bị xoá và email đó đăng ký lại được như email mới
