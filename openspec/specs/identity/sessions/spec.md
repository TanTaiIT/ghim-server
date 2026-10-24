# identity/sessions Specification

## Purpose

Cho người đã có tài khoản đăng nhập và giữ phiên trên các thiết bị của mình, với lớp bảo vệ chặt hơn cho
tài khoản master và tài khoản mang quyền staff (TK 5, TK 7).

## Requirements

### Requirement: Đăng nhập bằng email và mật khẩu

Người dùng SHALL đăng nhập được bằng email và mật khẩu; email được chuẩn hoá như lúc đăng ký trước khi tra.
Sai email hay sai mật khẩu MUST trả cùng một lỗi, không để lộ email đó có tài khoản hay không.

#### Scenario: Đăng nhập thành công

- **WHEN** người dùng gửi đúng email và mật khẩu của một tài khoản đã xác nhận
- **THEN** response có HTTP 200 và người dùng có một phiên đăng nhập mới

#### Scenario: Đăng nhập bằng biến thể của email

- **WHEN** tài khoản đăng ký bằng `lan@gmail.com` và người dùng đăng nhập bằng `Lan+ghim@gmail.com`
- **THEN** người dùng vào đúng tài khoản đó

#### Scenario: Sai mật khẩu

- **WHEN** người dùng gửi đúng email nhưng sai mật khẩu
- **THEN** response có HTTP 401 `INVALID_CREDENTIALS`

#### Scenario: Email chưa có tài khoản

- **WHEN** người dùng gửi một email chưa có tài khoản
- **THEN** response có HTTP 401 `INVALID_CREDENTIALS`, giống hệt trường hợp sai mật khẩu

### Requirement: Giới hạn phiên đăng nhập cùng lúc

Một tài khoản người dùng SHALL có tối đa 20 phiên đăng nhập cùng lúc (giá trị khởi đầu). Tài khoản master và
tài khoản mang quyền staff SHALL có tối đa 3 phiên (giá trị khởi đầu). Đăng nhập khi đã đủ số phiên SHALL vẫn
thành công: phiên có lần hoạt động cuối cũ nhất bị thu hồi để nhường chỗ — người dùng thật hiếm khi biết mình
còn phiên trên máy nào, nên từ chối đăng nhập chỉ làm khó đúng người đó.

#### Scenario: Người dùng thường

- **WHEN** một tài khoản người dùng đang có 20 phiên đăng nhập trên thiết bị thứ 21
- **THEN** phiên mới được tạo, phiên có lần hoạt động cuối cũ nhất bị thu hồi, và tài khoản vẫn không có quá
  20 phiên cùng hoạt động

#### Scenario: Thiết bị bị đẩy ra gọi tiếp

- **WHEN** thiết bị giữ phiên vừa bị thu hồi gọi một thao tác cần đăng nhập
- **THEN** response có HTTP 401 `SESSION_REVOKED`

#### Scenario: Tài khoản mang quyền staff

- **WHEN** một tài khoản mang quyền staff đang có 3 phiên đăng nhập trên thiết bị thứ 4
- **THEN** phiên mới được tạo, phiên cũ nhất bị thu hồi, và tài khoản vẫn không có quá 3 phiên cùng hoạt động

### Requirement: Phiên hết hạn khi không hoạt động

Phiên không có hoạt động nào trong 30 ngày (giá trị khởi đầu) SHALL hết hạn; thiết bị đó phải đăng nhập lại.

#### Scenario: Quá 30 ngày không dùng

- **WHEN** một thiết bị dùng lại phiên có lần hoạt động cuối cách đây hơn 30 ngày
- **THEN** response có HTTP 401 `SESSION_EXPIRED`

### Requirement: Đăng xuất

Người dùng SHALL đăng xuất được phiên hiện tại; phiên đã đăng xuất MUST NOT dùng lại được.

#### Scenario: Đăng xuất rồi gọi tiếp

- **WHEN** người dùng đăng xuất rồi thiết bị đó gọi một thao tác cần đăng nhập bằng phiên cũ
- **THEN** lượt đăng xuất có HTTP 204 và lượt gọi sau có HTTP 401 `SESSION_REVOKED`

### Requirement: Xem và thu hồi thiết bị đang đăng nhập

Người dùng SHALL xem được danh sách phiên đang hoạt động của mình — tên thiết bị do app gửi lên, lần hoạt
động cuối, phiên nào là phiên hiện tại — và thu hồi được một phiên bất kỳ hoặc mọi phiên trừ phiên hiện tại.
Danh sách MUST NOT chứa mã thiết bị hay mã phiên dùng để xác thực.

#### Scenario: Xem danh sách thiết bị

- **WHEN** người dùng có 3 phiên xem danh sách thiết bị
- **THEN** response có HTTP 200 với 3 mục, mỗi mục có tên thiết bị, lần hoạt động cuối và cờ phiên hiện tại

#### Scenario: Thu hồi một thiết bị khác

- **WHEN** người dùng thu hồi một phiên không phải phiên hiện tại
- **THEN** response có HTTP 204, thiết bị đó gọi tiếp nhận HTTP 401 `SESSION_REVOKED`, phiên hiện tại vẫn dùng
  được

#### Scenario: Thu hồi mọi thiết bị khác

- **WHEN** người dùng thu hồi mọi phiên trừ phiên hiện tại
- **THEN** chỉ còn một phiên hoạt động là phiên hiện tại

#### Scenario: Thu hồi phiên không thuộc về mình

- **WHEN** người dùng thu hồi một phiên của tài khoản khác hoặc một mã phiên không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Quên mật khẩu

Người dùng SHALL đặt lại được mật khẩu bằng mã gửi tới email đăng nhập; mã theo cùng luật hiệu lực, số lần
sai và gửi lại như mã xác nhận đăng ký. Yêu cầu gửi mã MUST trả lời giống nhau dù email có tài khoản hay
không. Đặt lại thành công SHALL thu hồi mọi phiên đang có.

#### Scenario: Email không có tài khoản

- **WHEN** ai đó xin mã đặt lại cho một email chưa có tài khoản
- **THEN** response có HTTP 200 giống hệt trường hợp email có tài khoản, và không có mã nào được gửi

#### Scenario: Đặt lại thành công

- **WHEN** người dùng nhập đúng mã còn hạn cùng mật khẩu mới hợp lệ
- **THEN** response có HTTP 200, mật khẩu mới dùng được, và mọi phiên trước đó gọi tiếp nhận HTTP 401
  `SESSION_REVOKED`

#### Scenario: Mật khẩu mới yếu

- **WHEN** người dùng nhập đúng mã nhưng mật khẩu mới dài 5 ký tự
- **THEN** response có HTTP 400 `PASSWORD_WEAK` và mã vẫn còn hiệu lực

### Requirement: Đổi mật khẩu khi đang đăng nhập

Người dùng SHALL đổi được mật khẩu khi cung cấp mật khẩu hiện tại. Đổi thành công SHALL thu hồi mọi phiên
khác, giữ lại phiên đang thao tác.

#### Scenario: Đổi mật khẩu thành công

- **WHEN** người dùng có 3 phiên nhập đúng mật khẩu hiện tại và mật khẩu mới hợp lệ
- **THEN** response có HTTP 204, phiên hiện tại vẫn dùng được và hai phiên kia gọi tiếp nhận HTTP 401
  `SESSION_REVOKED`

#### Scenario: Sai mật khẩu hiện tại

- **WHEN** người dùng nhập sai mật khẩu hiện tại
- **THEN** response có HTTP 401 `INVALID_CREDENTIALS` và mật khẩu không đổi

### Requirement: Làm mới phiên

Thiết bị SHALL làm mới được phiên bằng token làm mới đang dùng: mỗi lần làm mới MUST cấp token truy cập mới và
token làm mới mới, và token cũ từ đó MUST NOT làm mới được nữa. Token đã được thay mà còn được gửi lên quá 30 giây
(giá trị khởi đầu) sau lượt thay là dấu hiệu token bị lộ: hệ thống SHALL thu hồi cả phiên. Lượt thua của hai lượt
cùng lúc, hay token cũ gửi lại trong 30 giây đó, SHALL nhận lỗi riêng cho biết phiên vừa được làm mới; phiên MUST
NOT bị thu hồi vì lượt đó.

#### Scenario: Làm mới bằng token đang dùng

- **WHEN** thiết bị làm mới phiên bằng token làm mới đang dùng
- **THEN** response có HTTP 200 với token truy cập mới và token làm mới mới, và lượt làm mới sau đó bằng token
  cũ không còn được chấp nhận

#### Scenario: Token đã được thay bị gửi lại

- **WHEN** một token làm mới đã được thay bằng token mới quá 30 giây mà vẫn được gửi lên để làm mới
- **THEN** response có HTTP 401 `SESSION_REVOKED`, phiên bị thu hồi, và token làm mới mới của phiên đó cũng
  không làm mới được nữa

#### Scenario: Tab thứ hai gửi token vừa được thay

- **WHEN** 10 giây sau một lượt làm mới thành công, tab khác của cùng thiết bị gửi token làm mới cũ
- **THEN** response có HTTP 409 `REFRESH_CONFLICT`, và token làm mới của lượt thành công vẫn làm mới tiếp được

#### Scenario: Hai lượt làm mới cùng lúc

- **WHEN** app gửi hai lượt làm mới cùng lúc bằng cùng một token làm mới
- **THEN** một lượt có HTTP 200, lượt kia có HTTP 409 `REFRESH_CONFLICT`, và token làm mới của lượt 200 vẫn
  làm mới tiếp được

#### Scenario: Lượt thua không thu hồi phiên

- **WHEN** lượt làm mới nhận HTTP 409 `REFRESH_CONFLICT` và app dùng tiếp token truy cập của lượt thành công
- **THEN** phiên vẫn hoạt động, và danh sách thiết bị của người dùng vẫn có thiết bị đó

### Requirement: Trần phiên đúng cả khi đăng nhập cùng lúc

Nhiều lượt đăng nhập cùng lúc của một tài khoản SHALL không làm tài khoản có quá số phiên tối đa cùng hoạt động.

#### Scenario: Đăng nhập cùng lúc khi đã gần trần

- **WHEN** một tài khoản người dùng đang có 19 phiên và đăng nhập cùng lúc trên ba thiết bị nữa
- **THEN** cả ba lượt đăng nhập thành công và tài khoản vẫn không có quá 20 phiên cùng hoạt động

### Requirement: Bàn vận hành chỉ đòi phiên đăng nhập hợp lệ

Master và tài khoản mang quyền staff đúng phạm vi SHALL làm được thao tác của bàn vận hành ngay khi có phiên đăng nhập
hợp lệ, dù phiên mở bằng mật khẩu hay bằng Google. Hệ thống MUST NOT đòi lớp xác thực thứ hai, MUST NOT có thao tác
thiết lập lớp thứ hai, và đăng nhập MUST NOT đọc mã từ ứng dụng tạo mã (chốt 23/10/2026).

#### Scenario: Staff vừa được gắn quyền làm việc ngay

- **WHEN** tài khoản vừa được gắn quyền staff danh mục Điện thoại đăng nhập bằng đúng mật khẩu rồi mở hàng chờ của
  danh mục đó
- **THEN** response có HTTP 200 với hàng chờ của danh mục Điện thoại

#### Scenario: Master đăng nhập bằng mật khẩu rồi dùng bàn vận hành

- **WHEN** master đăng nhập bằng đúng email và mật khẩu, không gửi mã nào, rồi gọi một thao tác của bàn vận hành
- **THEN** thao tác được thực hiện

#### Scenario: Tài khoản có quyền đăng nhập bằng Google

- **WHEN** tài khoản mang quyền staff đã liên kết Google đăng nhập bằng Google
- **THEN** phiên được mở và người đó làm được thao tác của bàn vận hành trong phạm vi quyền của mình

#### Scenario: Client cũ vẫn gửi mã lúc đăng nhập

- **WHEN** master đăng nhập bằng đúng mật khẩu và gửi kèm một mã 6 số bất kỳ
- **THEN** phiên được mở; mã bị bỏ qua

#### Scenario: Gọi thao tác thiết lập lớp thứ hai cũ

- **WHEN** staff gọi thao tác bắt đầu hay xác nhận thiết lập lớp thứ hai
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Staff ngoài phạm vi vẫn bị chặn

- **WHEN** staff chỉ mang danh mục Điện thoại mở hàng chờ của danh mục Xe cộ
- **THEN** response có HTTP 403 `FORBIDDEN`
