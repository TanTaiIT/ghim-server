## Purpose

Cho người đã có tài khoản đăng nhập và giữ phiên trên các thiết bị của mình, với lớp bảo vệ chặt hơn cho
tài khoản master và tài khoản mang quyền staff (TK 5, TK 7).

## ADDED Requirements

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

### Requirement: Đăng nhập hai lớp cho master và staff

Tài khoản master và tài khoản mang quyền staff SHALL đăng nhập hai lớp bằng ứng dụng tạo mã. Chưa thiết lập
lớp thứ hai thì không làm được thao tác nào của bàn vận hành.

#### Scenario: Staff đăng nhập đủ hai lớp

- **WHEN** tài khoản mang quyền staff nhập đúng mật khẩu và đúng mã từ ứng dụng tạo mã
- **THEN** người đó vào được bàn vận hành

#### Scenario: Sai mã lớp thứ hai

- **WHEN** tài khoản mang quyền staff nhập đúng mật khẩu nhưng sai mã lớp thứ hai
- **THEN** response có HTTP 401 `INVALID_CREDENTIALS` và không có phiên nào được tạo

#### Scenario: Chưa thiết lập lớp thứ hai

- **WHEN** tài khoản vừa được gắn quyền staff, chưa thiết lập ứng dụng tạo mã, gọi một thao tác của bàn
  vận hành
- **THEN** response có HTTP 403 `TWO_FACTOR_REQUIRED`
