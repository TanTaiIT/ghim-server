# platform/help-content Specification

## Purpose

Cho người dùng, kể cả khách, đọc trợ giúp do master soạn — chủ đề và câu hỏi / đáp theo thứ tự master xếp — và cho master sửa
nội dung đó trên bàn vận hành mà không cần phát hành lại app.

## Requirements

### Requirement: Ai cũng đọc trợ giúp

Mọi người, kể cả chưa đăng nhập, SHALL đọc được mọi chủ đề trợ giúp cùng câu hỏi / đáp của chúng, theo thứ tự master đã
xếp; chủ đề thêm sau SHALL đứng cuối.

#### Scenario: Khách đọc trợ giúp

- **WHEN** master thêm hai chủ đề rồi khách mở trợ giúp
- **THEN** response có HTTP 200 với hai chủ đề đứng cuối danh sách, theo thứ tự thêm

### Requirement: Master soạn trợ giúp

Master SHALL thêm, sửa, xoá chủ đề trợ giúp; mỗi chủ đề MUST có tên và ít nhất một câu hỏi / đáp. Mỗi lượt thêm, sửa, xoá,
sắp xếp SHALL ghi vào nhật ký vận hành.

#### Scenario: Thêm rồi sửa

- **WHEN** master thêm một chủ đề rồi sửa tên và câu hỏi / đáp của nó
- **THEN** cả hai lượt nhận HTTP 201 rồi 200, trợ giúp có nội dung mới, và nhật ký có hai dòng thêm và sửa

#### Scenario: Chủ đề không có câu hỏi

- **WHEN** master thêm một chủ đề không có câu hỏi nào, hay tên quá 80 ký tự
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Chủ đề không có

- **WHEN** master xoá hay sửa một chủ đề không có (kể cả vừa xoá)
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Master sắp xếp chủ đề

Master SHALL sắp lại thứ tự chủ đề bằng cách gửi mã mọi chủ đề theo thứ tự mới. Danh sách gửi thiếu, thừa hay lặp chủ đề
MUST bị từ chối và không đổi thứ tự nào.

#### Scenario: Đảo thứ tự

- **WHEN** master gửi mã mọi chủ đề theo thứ tự ngược
- **THEN** response có HTTP 204 và trợ giúp hiện theo thứ tự đó

#### Scenario: Thiếu một chủ đề

- **WHEN** master gửi thiếu một chủ đề
- **THEN** response có HTTP 409 `CONFLICT` và thứ tự giữ nguyên

### Requirement: Chỉ master soạn trợ giúp

Thêm, sửa, xoá, sắp xếp trợ giúp MUST chỉ dành cho master.

#### Scenario: Staff soạn trợ giúp

- **WHEN** một staff hay một người dùng thường thêm chủ đề trợ giúp
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Khách soạn trợ giúp

- **WHEN** người chưa đăng nhập thêm chủ đề trợ giúp
- **THEN** response có HTTP 401 `UNAUTHORIZED`
