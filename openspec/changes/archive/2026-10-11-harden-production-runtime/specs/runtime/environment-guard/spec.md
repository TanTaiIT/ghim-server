## ADDED Requirements

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
