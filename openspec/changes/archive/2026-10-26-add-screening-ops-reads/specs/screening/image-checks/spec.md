## MODIFIED Requirements

### Requirement: Danh sách trắng ảnh mẫu của hãng

Staff và master SHALL xem, thêm, gỡ được ảnh mẫu của hãng trong danh sách trắng; danh sách SHALL kèm ảnh nguồn khi ảnh
đó còn trong kho. Ảnh trùng với một ảnh trong danh
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

#### Scenario: Staff xem danh sách trắng

- **WHEN** staff mở danh sách trắng có một ảnh mẫu vừa thêm từ ảnh của một tin
- **THEN** mục đó kèm đường xem mở được đúng ảnh nguồn; ảnh nguồn đã bị dọn khỏi kho thì đường xem là `null` và mục vẫn
  chặn ảnh trùng
