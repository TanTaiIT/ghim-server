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
tài khoản mang quyền staff SHALL có tối đa 3 phiên (giá trị khởi đầu).

#### Scenario: Người dùng thường

- **WHEN** một tài khoản người dùng đăng nhập trên thiết bị thứ 21
- **THEN** tài khoản đó vẫn không có quá 20 phiên cùng hoạt động

#### Scenario: Tài khoản mang quyền staff

- **WHEN** một tài khoản mang quyền staff đăng nhập trên thiết bị thứ 4
- **THEN** tài khoản đó vẫn không có quá 3 phiên cùng hoạt động

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
