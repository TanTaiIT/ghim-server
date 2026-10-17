# identity/registration Specification

## Purpose

Cho một người tạo tài khoản Ghim bằng email kèm mật khẩu, hoặc bằng Google, với đúng một tài khoản cho mỗi
email và không dùng SMS ở bất kỳ bước nào (TK 7).

## Requirements

### Requirement: Đăng ký bằng email và mật khẩu

Người dùng SHALL tạo được tài khoản bằng email và mật khẩu. Tài khoản mới ở trạng thái "chưa xác nhận",
và hệ thống gửi một mã xác nhận tới email đó. Mật khẩu hợp lệ SHALL dài từ 8 tới 128 ký tự (giá trị khởi
đầu) và MUST NOT nằm trong danh sách mật khẩu hay gặp đi kèm phần mềm; lỗi mật khẩu nói rõ cách sửa vì đây
không phải dấu hiệu gian lận.

#### Scenario: Đăng ký thành công

- **WHEN** khách gửi một email chưa có tài khoản cùng mật khẩu hợp lệ
- **THEN** response có HTTP 201, tài khoản ở trạng thái chưa xác nhận và một mã xác nhận được gửi tới email

#### Scenario: Thiếu email

- **WHEN** khách gửi yêu cầu đăng ký không có email
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Mật khẩu quá ngắn

- **WHEN** khách đăng ký với mật khẩu 7 ký tự
- **THEN** response có HTTP 400 `PASSWORD_WEAK` kèm câu nêu độ dài tối thiểu

#### Scenario: Mật khẩu hay gặp

- **WHEN** khách đăng ký với mật khẩu `12345678`
- **THEN** response có HTTP 400 `PASSWORD_WEAK` kèm câu nói mật khẩu này quá phổ biến

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
cần mã. Email đó đã có tài khoản thì người dùng vào chính tài khoản ấy, không sinh tài khoản thứ hai. Email đó
chỉ có một đăng ký chưa xác nhận thì đăng ký dở MUST bị xoá hẳn — kể cả mật khẩu và mọi phiên của nó — và
Google tạo một tài khoản mới đã xác nhận: người giữ đăng ký dở chưa chứng minh được email là của mình (chốt
15/10/2026).

#### Scenario: Lần đầu dùng Google

- **WHEN** khách đăng nhập bằng Google với một email chưa có tài khoản
- **THEN** một tài khoản mới được tạo ở trạng thái đã xác nhận

#### Scenario: Email đã có tài khoản

- **WHEN** khách đăng nhập bằng Google với email trùng (sau chuẩn hoá) một tài khoản đã có
- **THEN** khách vào đúng tài khoản đã có và hệ thống vẫn chỉ có một tài khoản cho email đó

#### Scenario: Email thuộc một đăng ký chưa xác nhận

- **WHEN** người A đăng ký bằng email của người B kèm mật khẩu, chưa xác nhận email, rồi người B đăng nhập bằng
  Google với email đó
- **THEN** người B vào một tài khoản mới đã xác nhận, phiên của người A nhận HTTP 401 `SESSION_REVOKED`, và
  đăng nhập bằng email cùng mật khẩu của người A nhận HTTP 401 `INVALID_CREDENTIALS`

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

Email thuộc danh sách miền email dùng một lần SHALL bị từ chối khi đăng ký, so theo đuôi miền nên miền con
của một miền bị chặn cũng bị chặn. Lý do từ chối SHALL được nói rõ, vì đây là lỗi người dùng tự sửa được.

#### Scenario: Đăng ký bằng email tạm

- **WHEN** khách đăng ký bằng một email thuộc miền trong danh sách dùng một lần
- **THEN** response có HTTP 400 `EMAIL_DISPOSABLE` kèm câu bảo dùng email thường

#### Scenario: Miền con của miền bị chặn

- **WHEN** `tempmail.example` nằm trong danh sách và khách đăng ký bằng `a@mx.tempmail.example`
- **THEN** response có HTTP 400 `EMAIL_DISPOSABLE`

### Requirement: Danh sách miền dùng một lần gồm hạt giống công khai và phần master sửa tay

Danh sách SHALL gồm hạt giống lấy từ một danh sách công khai do cộng đồng duy trì, cập nhật tự động hằng
tuần (giá trị khởi đầu), cộng với các miền master thêm tay. Master SHALL thêm hoặc bỏ được một miền mà
không cần phát hành lại phần mềm. Lượt cập nhật tự động MUST NOT xoá miền master đã thêm, MUST NOT thêm lại
miền master đã bỏ, và thất bại thì giữ nguyên danh sách đang có.

#### Scenario: Master thêm một miền mới

- **WHEN** master thêm một miền vào danh sách
- **THEN** lượt đăng ký kế tiếp bằng email thuộc miền đó bị từ chối với HTTP 400 `EMAIL_DISPOSABLE`

#### Scenario: Master bỏ một miền bị liệt kê oan

- **WHEN** master bỏ một miền có trong hạt giống rồi lượt cập nhật tự động kế tiếp chạy
- **THEN** email thuộc miền đó đăng ký được, và sau lượt cập nhật miền đó vẫn không bị chặn

#### Scenario: Cập nhật tự động giữ phần master đã thêm

- **WHEN** master đã thêm một miền không có trong hạt giống và lượt cập nhật tự động chạy
- **THEN** miền đó vẫn bị chặn sau khi cập nhật

### Requirement: Dọn đăng ký dở dang

Tài khoản chưa xác nhận quá 7 ngày (giá trị khởi đầu) SHALL bị xoá hẳn, để email đó đăng ký lại được.

#### Scenario: Bỏ dở quá hạn

- **WHEN** một tài khoản chưa xác nhận đã được tạo hơn 7 ngày
- **THEN** tài khoản bị xoá và email đó đăng ký lại được như email mới

### Requirement: Đăng ký lại bằng cùng email kế thừa gậy còn hiệu lực

Tài khoản mới tạo bằng email hay bằng Google, với email trùng (sau chuẩn hoá) email của một tài khoản đã xoá,
SHALL kế thừa mọi gậy còn hiệu lực của tài khoản đó — kể cả gậy ra sau khi tài khoản đã xoá, khi báo cáo được
xử trên bản lưu — giữ nguyên loại, điểm và ngày hết hạn. Hệ thống SHALL nhận ra email đó bằng một dấu không dò
ngược ra được email gốc.

#### Scenario: Đăng ký lại bằng biến thể của email

- **WHEN** tài khoản `lan@gmail.com` đã xoá còn một gậy thường hết hạn sau 25 ngày nữa, và khách tạo tài khoản
  mới bằng `Lan+moi@gmail.com`
- **THEN** tài khoản mới có gậy thường đó, 1 điểm, với đúng ngày hết hạn cũ

#### Scenario: Đăng ký lại bằng Google

- **WHEN** tài khoản đã xoá còn gậy hiệu lực và khách đăng nhập bằng Google lần đầu với cùng email đó
- **THEN** tài khoản mới được tạo và mang những gậy còn hiệu lực ấy

#### Scenario: Gậy đã hết hạn

- **WHEN** mọi gậy của tài khoản đã xoá đều hết hạn trước khi khách tạo tài khoản mới bằng cùng email
- **THEN** tài khoản mới không có gậy nào

#### Scenario: Gậy ra sau khi tài khoản đã xoá

- **WHEN** `minh@gmail.com` xoá tài khoản lúc đang bị báo cáo, báo cáo được xử đúng kèm một gậy nặng trong 90
  ngày tài khoản ẩn, rồi khách tạo tài khoản mới bằng `minh@gmail.com` khi gậy đó còn hiệu lực
- **THEN** tài khoản mới mang gậy nặng đó, 2 điểm, với đúng ngày hết hạn

### Requirement: Email của tài khoản bị khoá vĩnh viễn không đăng ký được tới khi gỡ khoá

Email của tài khoản bị master khoá vĩnh viễn vì gậy nghiêm trọng SHALL bị từ chối khi đăng ký tới khi master gỡ
khoá, so sau chuẩn hoá, ở cả đăng ký bằng email lẫn bằng Google. Việc chặn MUST NOT tự hết theo thời gian; gỡ
khoá thì email đó SHALL hết bị chặn.

#### Scenario: Đăng ký bằng biến thể của email bị chặn

- **WHEN** `hoa@gmail.com` bị chặn vì khoá vĩnh viễn, không còn thuộc tài khoản nào, và khách đăng ký
  `h.oa+2@gmail.com`
- **THEN** response có HTTP 403 `EMAIL_BANNED` và không tài khoản nào được tạo

#### Scenario: Đăng nhập Google bằng email bị chặn

- **WHEN** khách đăng nhập bằng Google lần đầu với một email đang bị chặn vì khoá vĩnh viễn
- **THEN** response có HTTP 403 `EMAIL_BANNED` và không tài khoản nào được tạo

#### Scenario: Khoá vĩnh viễn đã hơn 2 năm

- **WHEN** `hoa@gmail.com` bị khoá vĩnh viễn hơn 2 năm trước, master chọn giữ tiếp ở lần xem lại, và khách đăng
  ký `hoa@gmail.com`
- **THEN** response có HTTP 403 `EMAIL_BANNED`

#### Scenario: Sau khi master gỡ khoá

- **WHEN** master đã gỡ khoá vĩnh viễn gắn với `hoa@gmail.com` và khách đăng ký `h.oa+2@gmail.com`
- **THEN** lượt đăng ký không bị từ chối với `EMAIL_BANNED`
