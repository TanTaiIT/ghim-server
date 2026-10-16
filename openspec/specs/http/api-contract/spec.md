# http/api-contract Specification

## Purpose

Hợp đồng chung mà mọi endpoint của Ghim tuân theo — vỏ response, mã lỗi, mã truy vết, tài liệu API — để
app Ghim và bàn vận hành chỉ cần viết một lớp xử lý response.

## Requirements

### Requirement: Vỏ response thành công

Mọi response thành công SHALL có dạng `{ success: true, data }`, không kèm `message` hay `meta`.

#### Scenario: Gọi một endpoint thành công

- **WHEN** client gọi `GET /health`
- **THEN** response có HTTP 200 và thân là `{ success: true, data: { ... } }`

### Requirement: Vỏ response lỗi

Mọi response lỗi SHALL có dạng `{ success: false, error: { code, message } }`. `code` là mã ổn định để
client rẽ nhánh; `message` là câu tiếng Việt cho người dùng đọc và được phép đổi bất cứ lúc nào.

#### Scenario: Đường dẫn không tồn tại

- **WHEN** client gọi `GET /api/v1/khong-co`
- **THEN** response có HTTP 404, `error.code` là `NOT_FOUND`, cùng vỏ lỗi như mọi lỗi khác

#### Scenario: Lỗi nghiệp vụ mang mã riêng

- **WHEN** một thao tác bị chặn vì một lý do có mã riêng
- **THEN** response mang HTTP status của lỗi đó và `error.code` là đúng mã riêng ấy, không phải mã chung
  của status

### Requirement: Dữ liệu gửi lên sai định dạng

Request không khớp schema của endpoint SHALL bị từ chối trước khi chạm nghiệp vụ, với HTTP 400,
`error.code` là `VALIDATION_ERROR` và `error.details` mô tả từng field sai.

#### Scenario: Field bắt buộc để trống

- **WHEN** client gửi body có một field bắt buộc là chuỗi rỗng
- **THEN** response có HTTP 400, `error.code` là `VALIDATION_ERROR` và `error.details` có mặt

### Requirement: Xung đột khi ghi đồng thời

Khi một lượt ghi vi phạm ràng buộc dữ liệu vì một lượt khác vừa ghi chen vào, hay DB huỷ lượt ghi vì hai lượt chờ nhau,
hệ thống SHALL trả HTTP 409 `CONFLICT` kèm câu báo tải lại rồi thử lại. Dòng vừa bị xoá trước lúc ghi SHALL trả HTTP
404 `NOT_FOUND`.

#### Scenario: Hai lượt ghi cùng một giá trị duy nhất

- **WHEN** hai request cùng lúc ghi một giá trị phải là duy nhất
- **THEN** một request thành công, request kia nhận HTTP 409 `CONFLICT`

#### Scenario: Vi phạm ràng buộc kiểm tra hoặc loại trừ

- **WHEN** hai lượt ghi chen nhau làm dữ liệu vi phạm một ràng buộc kiểm tra hoặc loại trừ của DB
- **THEN** lượt bị từ chối nhận HTTP 409 `CONFLICT`, không phải 500

#### Scenario: Dòng vừa bị người khác xoá

- **WHEN** client sửa một dòng vừa bị xoá giữa lúc kiểm và lúc ghi
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Hai lượt ghi chờ nhau

- **WHEN** DB huỷ một lượt ghi vì nó và một lượt khác chờ khoá của nhau
- **THEN** lượt bị huỷ nhận HTTP 409 `CONFLICT` kèm câu báo thử lại, không phải 500

### Requirement: Không lộ chi tiết nội bộ

Lỗi không lường trước SHALL trả HTTP 500, `error.code` là `INTERNAL_ERROR`, câu báo "Lỗi hệ thống", không
kèm câu lỗi gốc, câu SQL, tên bảng hay đường dẫn file. Server trả sai hình dạng đã cam kết cũng SHALL là
500, không phải 400.

#### Scenario: Lỗi lạ mang câu SQL

- **WHEN** một lỗi không lường trước chứa câu SQL xảy ra trong lúc xử lý request
- **THEN** response có HTTP 500 `INTERNAL_ERROR` và thân không chứa câu SQL đó

#### Scenario: Response sai hình dạng đã khai

- **WHEN** server tạo response không khớp schema response của endpoint
- **THEN** client nhận HTTP 500 `INTERNAL_ERROR`, không nhận dữ liệu sai hình dạng

### Requirement: Mã truy vết request

Mỗi response SHALL mang header `x-request-id`: giữ nguyên giá trị client gửi lên khi giá trị đó dài tối đa 128 ký
tự và chỉ gồm chữ cái Latin, chữ số và các ký tự `.` `_` `:` `-`; ngược lại, hoặc khi client không gửi, response
mang một UUID mới. Giá trị sai định dạng MUST NOT xuất hiện trong response hay trong log.

#### Scenario: Client gửi sẵn mã truy vết

- **WHEN** client gửi header `x-request-id: dau-vet-tu-ngoai`
- **THEN** response mang đúng header `x-request-id: dau-vet-tu-ngoai`

#### Scenario: Client không gửi mã truy vết

- **WHEN** client không gửi header `x-request-id`
- **THEN** response mang header `x-request-id` là một UUID mới

#### Scenario: Mã truy vết quá dài

- **WHEN** client gửi header `x-request-id` dài 129 ký tự
- **THEN** response mang header `x-request-id` là một UUID mới, không phải giá trị client gửi

#### Scenario: Mã truy vết có ký tự lạ

- **WHEN** client gửi header `x-request-id: abc<script>`
- **THEN** response mang header `x-request-id` là một UUID mới

### Requirement: Tài liệu API

Tài liệu OpenAPI SHALL được sinh từ chính schema đang validate request, phục vụ ở `/docs` ngoài
production. Ở production, `/docs` SHALL không tồn tại.

#### Scenario: Môi trường development

- **WHEN** người dùng mở `/docs` trên server chạy với `NODE_ENV=development`
- **THEN** trang tài liệu API hiện ra với HTTP 200

#### Scenario: Môi trường production

- **WHEN** người dùng mở `/docs` trên server chạy với `NODE_ENV=production`
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Mặc định không cho giữ lại response

Mọi response của API SHALL cấm app, trình duyệt và máy chủ trung gian giữ lại một bản, trừ khi chính endpoint
đó cho phép tường minh. Response lỗi MUST NOT cho phép giữ lại.

#### Scenario: Hồ sơ của tôi

- **WHEN** người dùng đã đăng nhập đọc hồ sơ của chính mình
- **THEN** response có HTTP 200 và cấm giữ lại

#### Scenario: Bàn vận hành

- **WHEN** master đọc danh sách staff ở bàn vận hành
- **THEN** response có HTTP 200 và cấm giữ lại

#### Scenario: Lỗi trên một endpoint cho phép giữ lại

- **WHEN** khách xem danh sách phường của một mã tỉnh không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND` và cấm giữ lại
