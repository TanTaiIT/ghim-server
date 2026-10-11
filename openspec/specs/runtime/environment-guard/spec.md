# runtime/environment-guard Specification

## Purpose

Chặn từ lúc khởi động mọi cấu hình có thể làm mất dữ liệu thật: thiếu biến môi trường, trỏ nhầm DB của
môi trường khác, hoặc chạy lệnh xoá dữ liệu trên production.

## Requirements

### Requirement: Thiếu hoặc sai cấu hình thì không khởi động

App SHALL từ chối khởi động khi thiếu chuỗi kết nối DB hoặc một biến môi trường có giá trị không hợp lệ,
và báo đúng tên biến sai — không khởi động rồi hỏng ở request đầu tiên.

#### Scenario: Thiếu chuỗi kết nối DB

- **WHEN** app khởi động mà không có `DATABASE_URL`
- **THEN** app dừng ngay với lỗi nêu `DATABASE_URL`

#### Scenario: Môi trường không hợp lệ

- **WHEN** app khởi động với `NODE_ENV=staging`
- **THEN** app dừng ngay với lỗi "Biến môi trường không hợp lệ"

### Requirement: Mỗi môi trường một DB

Tên DB SHALL khớp môi trường: development dùng DB tên kết thúc bằng `_dev`, test dùng `_test`, production
dùng DB không mang hai hậu tố đó. App và công cụ migration SHALL từ chối chạy khi lệch.

#### Scenario: Development trỏ vào DB production

- **WHEN** app chạy với `NODE_ENV=development` và DB tên `ghim`
- **THEN** app từ chối khởi động với lỗi đòi DB kết thúc bằng `_dev`

#### Scenario: Production trỏ vào DB test

- **WHEN** app chạy với `NODE_ENV=production` và DB tên `ghim_test`
- **THEN** app từ chối khởi động

#### Scenario: Bỏ trống môi trường

- **WHEN** app chạy không khai `NODE_ENV` và DB tên `ghim_prod`
- **THEN** app coi là development và từ chối khởi động vì DB không kết thúc bằng `_dev`

### Requirement: Production không chạy lệnh xoá dữ liệu

Trên production, công cụ migration SHALL chỉ cho áp migration đã có; các lệnh reset DB, sinh migration từ
độ lệch, đẩy schema trực tiếp và ghi dữ liệu mồi SHALL bị từ chối trước khi chạm DB.

#### Scenario: Reset DB trên production

- **WHEN** người vận hành chạy lệnh reset DB với `NODE_ENV=production`
- **THEN** lệnh bị từ chối và DB không bị chạm tới

### Requirement: Production đòi cấu hình mạng tường minh

Ở production, app SHALL từ chối khởi động khi danh sách nguồn được gọi API là "mọi nguồn" hay bỏ trống, và khi
không khai proxy nào đứng trước app. Proxy SHALL được khai bằng địa chỉ hoặc dải địa chỉ của nó; ở mọi môi trường,
cấu hình "tin mọi proxy" và cấu hình theo số hop MUST bị từ chối: cả hai để client nối thẳng tự khai địa chỉ của mình.

#### Scenario: Production cho mọi nguồn gọi API

- **WHEN** app khởi động với `NODE_ENV=production` và `CORS_ORIGIN=*`
- **THEN** app dừng ngay với lỗi nêu `CORS_ORIGIN`

#### Scenario: Production không khai proxy

- **WHEN** app khởi động với `NODE_ENV=production` và không có `TRUST_PROXY`
- **THEN** app dừng ngay với lỗi nêu `TRUST_PROXY`

#### Scenario: Tin mọi proxy

- **WHEN** app khởi động ở bất kỳ môi trường nào với `TRUST_PROXY=true`
- **THEN** app dừng ngay với lỗi nêu `TRUST_PROXY`

#### Scenario: Khai proxy bằng số hop

- **WHEN** app khởi động với `TRUST_PROXY=1`
- **THEN** app dừng ngay với lỗi nêu `TRUST_PROXY`, vì số hop không kiểm được máy đang nối trực tiếp vào app

#### Scenario: Production khai đủ

- **WHEN** app khởi động với `NODE_ENV=production`, `CORS_ORIGIN` là một danh sách nguồn cụ thể và
  `TRUST_PROXY` là dải địa chỉ của proxy
- **THEN** app khởi động bình thường
