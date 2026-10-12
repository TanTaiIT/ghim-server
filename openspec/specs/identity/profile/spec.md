# identity/profile Specification

## Purpose

Cho người mua biết mình đang giao dịch với ai qua một hồ sơ công khai, và cho người bán tự chọn có để lại số
điện thoại hay không (TK 7).

## Requirements

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

### Requirement: Ảnh đại diện

Người dùng SHALL đặt, đổi và bỏ được ảnh đại diện của mình bằng một ảnh đã tải vào kho cho hồ sơ của mình, hoặc
bằng ảnh đại diện của tài khoản Google đã nối. Tài khoản tạo bằng đăng nhập Google SHALL mặc định dùng ảnh đại diện
Google. Hồ sơ công khai SHALL hiện ảnh đại diện trong kho bằng một đường xem có hạn do hệ thống cấp, MUST NOT để lộ
đường dẫn cố định vào kho.

#### Scenario: Đặt ảnh đại diện

- **WHEN** người dùng đặt ảnh đại diện bằng một ảnh đã tải xong cho hồ sơ của mình
- **THEN** response có HTTP 200 với hồ sơ mang ảnh mới, và hồ sơ công khai trả một đường xem mở được đúng ảnh đó

#### Scenario: Bỏ ảnh đại diện

- **WHEN** người dùng bỏ ảnh đại diện
- **THEN** response có HTTP 200 với hồ sơ không có ảnh đại diện

#### Scenario: Tài khoản mới tạo bằng Google

- **WHEN** một người lần đầu đăng nhập bằng Google và tài khoản Google có ảnh đại diện
- **THEN** tài khoản mới dùng ảnh đại diện Google đó

### Requirement: Hồ sơ công khai liệt kê tin đang bán

Hồ sơ công khai SHALL liệt kê các tin đang hiển thị của người đó — cả mức đầy đủ lẫn hạn chế — mà người xem được
phép thấy theo luật "ai thấy một tin" (listing/visibility). Tin nháp, đang kiểm, chờ duyệt, bị từ chối, bị gỡ,
đã xoá hay đang tạm ẩn MUST NOT có trong danh sách (TK 7).

#### Scenario: Khách xem hồ sơ

- **WHEN** khách mở hồ sơ của người bán có một tin sàn chung đầy đủ và một tin sàn chung hạn chế
- **THEN** danh sách tin trên hồ sơ có cả hai tin

#### Scenario: Tin "chỉ thành viên"

- **WHEN** người bán có một tin "chỉ thành viên" của nhóm X, và lần lượt khách rồi một thành viên nhóm X mở hồ
  sơ
- **THEN** khách không thấy tin đó trên hồ sơ, còn thành viên nhóm X thì thấy

#### Scenario: Tin chưa lên bảng hoặc đang tạm ẩn

- **WHEN** người bán có một nháp, một tin chờ duyệt và một tin đang tạm ẩn vì nhóm bị khoá
- **THEN** cả ba tin không có trên hồ sơ công khai

#### Scenario: Tin đã bán hoặc hết hạn

- **WHEN** người bán có một tin sàn chung đã bán và một tin sàn chung hết hạn
- **THEN** cả hai không có trên hồ sơ công khai, nhưng mở bằng đường link vẫn nhận HTTP 200 (chốt 12/10/2026)
