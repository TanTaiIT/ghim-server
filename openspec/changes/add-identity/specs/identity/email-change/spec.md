## Purpose

Cho người dùng đổi email đăng nhập mà không mở ra đường lách luật "mỗi email một tài khoản" bằng cách đổi
email liên tục (TK 7).

## ADDED Requirements

### Requirement: Đổi email phải xác nhận email mới

Người dùng SHALL đổi được email bằng cách nhập mã gửi tới email mới. Trước khi xác nhận, email cũ vẫn là
email đăng nhập. Email mới MUST qua cùng luật chuẩn hoá, trùng và email dùng một lần như lúc đăng ký.

#### Scenario: Đổi email thành công

- **WHEN** người dùng xin đổi sang một email chưa có tài khoản và nhập đúng mã gửi tới email đó
- **THEN** email đăng nhập đổi sang email mới

#### Scenario: Chưa xác nhận

- **WHEN** người dùng xin đổi email nhưng chưa nhập mã
- **THEN** người dùng vẫn đăng nhập bằng email cũ, không đăng nhập được bằng email mới

#### Scenario: Email mới đã thuộc người khác

- **WHEN** người dùng xin đổi sang một email trùng (sau chuẩn hoá) tài khoản khác
- **THEN** response có HTTP 409 `EMAIL_TAKEN`

### Requirement: Giới hạn tần suất đổi email

Mỗi tài khoản SHALL đổi email tối đa 1 lần trong 30 ngày (giá trị khởi đầu), tính từ lần đổi thành công gần
nhất.

#### Scenario: Đổi lần hai quá sớm

- **WHEN** người dùng đã đổi email 10 ngày trước và xin đổi tiếp
- **THEN** response có HTTP 429 `EMAIL_CHANGE_TOO_SOON` kèm ngày được đổi lại
