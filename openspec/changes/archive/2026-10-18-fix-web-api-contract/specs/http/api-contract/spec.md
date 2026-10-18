## ADDED Requirements

### Requirement: Trình duyệt gọi được mọi phương thức của API

Một trang web chạy ở origin được phép — bàn vận hành, bản web của app — SHALL gọi được mọi phương thức mà API dùng
(`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`), kể cả khi request kèm phiên đăng nhập và mã thiết bị. Origin không
nằm trong danh sách được phép MUST NOT được cấp quyền gọi (chốt 18/10/2026).

#### Scenario: Lưu nháp từ trình duyệt

- **WHEN** một trang web ở origin được phép hỏi trước xem có được gửi `PATCH` kèm phiên đăng nhập và mã thiết bị
- **THEN** server cho phép `PATCH` cùng cả hai header đó

#### Scenario: Thao tác ghi của bàn vận hành

- **WHEN** một trang web ở origin được phép hỏi trước xem có được gửi `PUT` và `DELETE`
- **THEN** server cho phép cả hai phương thức

#### Scenario: Origin không được phép

- **WHEN** server chỉ cho phép một danh sách origin, và một trang web ở origin khác hỏi trước xem có được gửi `PATCH`
- **THEN** response không cấp quyền cho origin đó, và trình duyệt không gửi request thật

### Requirement: Tài liệu khai cách xác thực của từng route

Tài liệu API SHALL nói đúng mỗi route cần gì để gọi: bắt buộc phiên đăng nhập, phiên tuỳ chọn (gọi ẩn danh được, kèm
phiên thì kết quả theo người xem), hay không cần phiên. Route phiên tuỳ chọn MUST được khai cả hai cách gọi, để client
sinh từ tài liệu gửi phiên khi người dùng đã đăng nhập mà vẫn gọi được khi chưa đăng nhập (chốt 18/10/2026).

#### Scenario: Route đọc tin nhận phiên tuỳ chọn

- **WHEN** đọc tài liệu của các route xem bảng tin, xem một tin, tin tương tự, tin trong một nhóm, tin của một người
  bán
- **THEN** mỗi route khai rằng gọi được không phiên hoặc kèm Bearer

#### Scenario: Route bắt buộc phiên

- **WHEN** đọc tài liệu của route xem tin của chính mình
- **THEN** route khai bắt buộc Bearer

#### Scenario: Route không cần phiên

- **WHEN** đọc tài liệu của route danh sách danh mục
- **THEN** route không khai cách xác thực nào

#### Scenario: Khách vẫn đọc được tin không cần phiên

- **WHEN** khách chưa đăng nhập xem một tin đang hiển thị trên sàn chung, không kèm phiên
- **THEN** response có HTTP 200 với tin đó

#### Scenario: Chủ tin mở nháp của chính mình

- **WHEN** người đăng mở nháp của chính mình qua route xem một tin, kèm phiên đăng nhập
- **THEN** response có HTTP 200 với bản của người đăng, gồm trạng thái nháp

#### Scenario: Mở nháp của người khác hay không kèm phiên

- **WHEN** khách hoặc một người dùng khác mở nháp đó qua route xem một tin
- **THEN** response có HTTP 404 `NOT_FOUND`, như tin không tồn tại
