## Purpose

Kiểm từng ảnh của tin — trùng với ảnh của tài khoản khác; nội dung nhạy cảm thêm ở `add-image-moderation` — và
bảo đảm không ảnh nào hiện
công khai trước khi có kết quả (TK 13, TK 25, cam kết 4).

## ADDED Requirements

### Requirement: Tin chỉ hiện khi có kết quả cho chữ và mọi ảnh

Chữ của tin SHALL được chấm ngay khi gửi, các ảnh được kiểm song song. Tin MUST NOT hiện với người khác khi
chưa có kết quả máy cho cả chữ lẫn từng ảnh — không có khoảng trống nào để ảnh xấu hiện công khai.

#### Scenario: Còn một ảnh chưa có kết quả

- **WHEN** chữ của một tin 3 ảnh đã chấm xong, hai ảnh đã có kết quả, ảnh thứ ba chưa có
- **THEN** tin vẫn ở trạng thái đang kiểm và không hiện với người khác

#### Scenario: Đủ kết quả

- **WHEN** chữ và cả 3 ảnh của tin đều đã có kết quả, không trúng gì, người đăng là T2
- **THEN** kết quả máy là hiện đầy đủ

### Requirement: Ảnh trùng với tin của tài khoản khác là cổng cứng

Mỗi ảnh SHALL được so trùng với ảnh của mọi tài khoản khác trong kho. Ảnh giống hệt hoặc gần như giống hệt ảnh
của tài khoản khác SHALL làm tin dính cổng cứng "ảnh trùng". Ảnh trùng với ảnh của chính người đăng MUST NOT
tính.

#### Scenario: Dùng lại ảnh của người khác

- **WHEN** tài khoản B gửi tin có một ảnh gần như giống hệt ảnh trong tin của tài khoản A
- **THEN** tin của B dính cổng cứng "ảnh trùng" và kết quả máy là giữ cho người

#### Scenario: Dùng lại ảnh của chính mình

- **WHEN** tài khoản A gửi tin mới có một ảnh giống hệt ảnh trong tin cũ của chính A
- **THEN** tin không dính cổng cứng "ảnh trùng"

### Requirement: Danh sách trắng ảnh mẫu của hãng

Staff và master SHALL thêm, gỡ được ảnh mẫu của hãng trong danh sách trắng. Ảnh trùng với một ảnh trong danh
sách trắng MUST NOT tính là ảnh trùng.

#### Scenario: Hai người cùng dùng ảnh mẫu của hãng

- **WHEN** ảnh mẫu một mẫu điện thoại nằm trong danh sách trắng và hai tài khoản khác nhau cùng dùng ảnh đó
  trong tin của mình
- **THEN** không tin nào dính cổng cứng "ảnh trùng" vì ảnh đó

#### Scenario: Staff gỡ ảnh khỏi danh sách trắng

- **WHEN** staff gỡ một ảnh khỏi danh sách trắng rồi tài khoản B gửi tin dùng ảnh đó, vốn đã có trong tin
  của tài khoản A
- **THEN** tin của B dính cổng cứng "ảnh trùng"

#### Scenario: Người dùng thường thêm ảnh vào danh sách trắng

- **WHEN** một tài khoản không mang quyền staff thêm ảnh vào danh sách trắng
- **THEN** response có HTTP 403 `FORBIDDEN`
