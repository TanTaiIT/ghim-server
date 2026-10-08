## Purpose

Cho người mua biết mình đang giao dịch với ai qua một hồ sơ công khai, và cho người bán tự chọn có để lại số
điện thoại hay không (TK 7).

## ADDED Requirements

### Requirement: Hồ sơ công khai

Mọi người, kể cả khách chưa đăng nhập, SHALL xem được hồ sơ công khai của một tài khoản gồm tên hiển thị,
ảnh đại diện và ngày tham gia. Hồ sơ công khai MUST NOT chứa email.

#### Scenario: Khách xem hồ sơ

- **WHEN** khách chưa đăng nhập mở hồ sơ của một tài khoản
- **THEN** response có HTTP 200 với tên hiển thị, ảnh đại diện, ngày tham gia và không có email

#### Scenario: Tài khoản không tồn tại

- **WHEN** khách mở hồ sơ bằng một mã tài khoản không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Số điện thoại tuỳ chọn, chưa xác minh

Người dùng SHALL tự thêm, sửa hoặc xoá số điện thoại trên hồ sơ. Số này không được xác thực, và mọi nơi
hiện số MUST kèm nhãn "chưa xác minh".

#### Scenario: Thêm số điện thoại

- **WHEN** người dùng thêm số điện thoại vào hồ sơ
- **THEN** hồ sơ công khai hiện số đó kèm nhãn "chưa xác minh" và không có SMS nào được gửi

#### Scenario: Không thêm số

- **WHEN** người dùng không thêm số điện thoại
- **THEN** hồ sơ công khai không có số điện thoại nào

### Requirement: Tên dành riêng

Tên hiển thị MUST NOT trùng tên dành riêng cho bộ phận quản lý (ví dụ "Quản trị hệ thống"), so không phân
biệt hoa thường và dấu.

#### Scenario: Đặt tên giả bộ phận quản lý

- **WHEN** người dùng đặt tên hiển thị là "quan tri he thong"
- **THEN** response có HTTP 400 `DISPLAY_NAME_RESERVED`
