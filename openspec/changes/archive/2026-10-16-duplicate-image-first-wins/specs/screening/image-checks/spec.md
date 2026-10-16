## MODIFIED Requirements

### Requirement: Ảnh trùng với tin của tài khoản khác là cổng cứng

Mỗi ảnh SHALL được so trùng với ảnh của tài khoản khác đã kiểm xong trước nó. Ảnh giống hệt hoặc gần như giống hệt
một ảnh như vậy SHALL làm tin dính cổng cứng "ảnh trùng". Ảnh của tài khoản khác kiểm xong sau — kể cả bản chép — MUST
NOT làm tin dính cổng này: người đăng trước thắng (chốt 16/10/2026). Ảnh trùng với ảnh của chính người đăng MUST NOT
tính.

#### Scenario: Dùng lại ảnh của người khác

- **WHEN** tài khoản B gửi tin có một ảnh gần như giống hệt ảnh trong tin của tài khoản A
- **THEN** tin của B dính cổng cứng "ảnh trùng" và kết quả máy là giữ cho người

#### Scenario: Dùng lại ảnh của chính mình

- **WHEN** tài khoản A gửi tin mới có một ảnh giống hệt ảnh trong tin cũ của chính A
- **THEN** tin không dính cổng cứng "ảnh trùng"

#### Scenario: Chủ ảnh sửa tin sau khi bị chép

- **WHEN** tài khoản B gửi tin dùng lại ảnh trong tin đang hiển thị của tài khoản A, rồi A sửa giá tin của mình
- **THEN** tin của B dính cổng cứng "ảnh trùng", còn tin của A không dính và máy cho qua như trước khi B chép
