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

### Requirement: Tên hiển thị qua bộ lọc cụm từ cấm

Tên hiển thị SHALL qua cùng bộ lọc cụm từ cấm như tin đăng, với cùng cách so khớp (ranh giới chữ, không phân
biệt dấu, ghép chữ cái tách rời, ngoại lệ). Tên chứa cụm mức chắc đang bật MUST NOT hiện trên hồ sơ công
khai (TK 7).

#### Scenario: Đặt tên chứa cụm mức chắc

- **WHEN** "bán súng" là cụm mức chắc đang bật và người dùng đổi tên hiển thị thành "Bán Súng Giá Rẻ"
- **THEN** hồ sơ công khai không hiện tên mới đó

#### Scenario: Lách bằng chữ cái tách rời

- **WHEN** "bán súng" là cụm mức chắc đang bật và người dùng đổi tên hiển thị thành "b á n s ú n g"
- **THEN** hồ sơ công khai không hiện tên mới đó

#### Scenario: Cụm đang chạy thử

- **WHEN** "bán súng" là cụm mức chắc đang chạy thử và người dùng đổi tên hiển thị thành "Bán Súng Giá Rẻ"
- **THEN** hồ sơ công khai hiện tên mới

#### Scenario: Tên bình thường

- **WHEN** người dùng đổi tên hiển thị thành một tên không trúng cụm nào
- **THEN** hồ sơ công khai hiện tên mới

### Requirement: Tên bị lọc hiện bằng tên chung

Tên hiển thị không qua bộ lọc SHALL hiện với người khác là "Người dùng Ghim" ở mọi chỗ hiện tên; chủ tài khoản SHALL
vẫn thấy tên mình kèm lời nhắc đổi tên. Cụm mức mơ hồ MUST NOT có tác dụng với tên hiển thị (chốt 12/10/2026).

#### Scenario: Người khác xem hồ sơ

- **WHEN** "bán súng" là cụm mức chắc đang bật và một người dùng có tên hiển thị "Bán Súng Giá Rẻ"
- **THEN** người khác mở hồ sơ thấy tên "Người dùng Ghim", còn chủ tài khoản thấy tên mình kèm lời nhắc đổi tên

#### Scenario: Tên chứa cụm mơ hồ

- **WHEN** tên hiển thị của một người dùng chứa một cụm mức mơ hồ đang bật
- **THEN** hồ sơ công khai hiện đúng tên đó

### Requirement: Công tắc hiện trạng thái hoạt động

Người dùng SHALL bật tắt được việc hiện trạng thái hoạt động của mình trong hội thoại (`messaging/activity-status`). Tài
khoản mới MUST bật sẵn. Xoá tài khoản MUST xoá luôn mốc hoạt động lần cuối của tài khoản đó (cam kết 31).

#### Scenario: Mặc định bật

- **WHEN** một người dùng mới đăng ký xem hồ sơ của mình
- **THEN** hồ sơ cho biết trạng thái hoạt động đang hiện

#### Scenario: Tắt

- **WHEN** người dùng tắt hiện trạng thái hoạt động
- **THEN** response có HTTP 200 và hồ sơ của người dùng cho biết trạng thái hoạt động đang tắt

#### Scenario: Giá trị sai

- **WHEN** người dùng gửi công tắc không phải đúng / sai
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và công tắc không đổi

#### Scenario: Xoá tài khoản

- **WHEN** người dùng tự xoá tài khoản
- **THEN** mốc hoạt động lần cuối của tài khoản không còn lưu

### Requirement: Hồ sơ của tôi cho biết quyền staff

Hồ sơ của chính mình SHALL cho biết tài khoản có đang mang quyền staff còn hiệu lực không (`platform/staff-permissions`),
để client biết có hiện lối vào bàn vận hành không. Quyền đang treo MUST tính là không có. Hồ sơ MUST NOT nói phạm vi
hay danh mục được giao, và hồ sơ công khai MUST NOT có cờ này.

#### Scenario: Staff xem hồ sơ của mình

- **WHEN** một người dùng mang quyền staff còn hiệu lực xem hồ sơ của mình
- **THEN** hồ sơ cho biết đang có quyền staff, và không có phạm vi hay danh mục nào

#### Scenario: Người dùng thường

- **WHEN** một người dùng chưa từng được gắn quyền staff xem hồ sơ của mình
- **THEN** hồ sơ cho biết không có quyền staff

#### Scenario: Quyền đang treo

- **WHEN** quyền staff của một người dùng đang treo và người đó xem hồ sơ của mình
- **THEN** hồ sơ cho biết không có quyền staff

#### Scenario: Quyền bị thu

- **WHEN** master thu toàn bộ quyền staff của một người dùng rồi người đó xem hồ sơ của mình
- **THEN** hồ sơ cho biết không có quyền staff

#### Scenario: Hồ sơ công khai của staff

- **WHEN** người khác xem hồ sơ công khai của một staff
- **THEN** response không có cờ quyền staff
