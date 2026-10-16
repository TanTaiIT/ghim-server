# identity/account-lock Specification

## Purpose

Cho master dừng ngay một tài khoản đang gây hại, giữ nguyên lịch sử, và cho người bị khoá biết vì sao
(TK 6, TK 7, TK 22).

## Requirements

### Requirement: Master khoá và mở khoá tài khoản

Chỉ master SHALL khoá và mở khoá được một tài khoản, và mỗi lần khoá MUST kèm lý do. Khoá MUST NOT xoá dữ
liệu nào của tài khoản.

#### Scenario: Master khoá tài khoản

- **WHEN** master khoá một tài khoản kèm lý do
- **THEN** tài khoản chuyển sang bị khoá và mọi phiên đăng nhập của nó bị thu hồi ngay

#### Scenario: Khoá không có lý do

- **WHEN** master khoá một tài khoản mà bỏ trống lý do
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Người không phải master thử khoá

- **WHEN** một tài khoản mang quyền staff gọi thao tác khoá tài khoản
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Mở khoá

- **WHEN** master mở khoá một tài khoản đang bị khoá
- **THEN** chủ tài khoản đăng nhập lại được bằng thông tin cũ

### Requirement: Tài khoản bị khoá không dùng được app nhưng biết lý do

Tài khoản bị khoá MUST NOT đăng nhập hay gọi được thao tác nào. Lượt đăng nhập đúng mật khẩu của tài khoản bị
khoá SHALL nhận lý do khoá, để người đó biết vì sao và liên hệ hỗ trợ.

#### Scenario: Đăng nhập khi đang bị khoá

- **WHEN** chủ tài khoản bị khoá đăng nhập đúng email và mật khẩu
- **THEN** response có HTTP 403 `ACCOUNT_LOCKED` kèm lý do khoá, và không có phiên nào được tạo

#### Scenario: Sai mật khẩu khi đang bị khoá

- **WHEN** ai đó đăng nhập tài khoản bị khoá bằng sai mật khẩu
- **THEN** response có HTTP 401 `INVALID_CREDENTIALS`, không lộ lý do khoá

### Requirement: Mở khoá trả tài khoản về trạng thái trước khi khoá

Mở khoá SHALL trả tài khoản về đúng trạng thái lúc bị khoá: tài khoản đã xác nhận email trở lại hoạt động, tài khoản chưa
xác nhận email vẫn chưa xác nhận. Mở khoá MUST NOT coi một email là đã xác nhận.

#### Scenario: Mở khoá tài khoản chưa xác nhận email

- **WHEN** master khoá một tài khoản chưa nhập mã xác nhận email, rồi mở khoá, rồi chủ tài khoản gọi một thao tác cần email đã xác nhận
- **THEN** response có HTTP 403 `EMAIL_NOT_VERIFIED`

#### Scenario: Mở khoá tài khoản đã xác nhận email

- **WHEN** master khoá rồi mở khoá một tài khoản đã xác nhận email
- **THEN** tài khoản trở lại hoạt động và dùng được mọi tính năng như trước khi bị khoá
