## MODIFIED Requirements

### Requirement: Tin sống gồm những gì

Tin sống SHALL gồm tin đang hiển thị không bị tạm ẩn, tin đang kiểm và tin chờ duyệt, đếm chung sàn chung và
mọi nhóm. Nháp, tin tạm ẩn, tin đã bán, hết hạn, bị từ chối, bị gỡ MUST NOT được tính vào tin sống.

#### Scenario: Đếm chung mọi nơi

- **WHEN** người dùng ở mức T0 có 4 tin đang hiển thị trên sàn chung, 3 tin ở nhóm A, 3 tin ở nhóm B, rồi gửi
  một tin vào nhóm C
- **THEN** response có HTTP 409 `LISTING_QUOTA_EXCEEDED`

#### Scenario: Tin chờ duyệt chiếm chỗ

- **WHEN** người dùng ở mức T0 có 9 tin đang hiển thị và 1 tin chờ duyệt gửi một tin mới
- **THEN** response có HTTP 409 `LISTING_QUOTA_EXCEEDED`

#### Scenario: Tin tạm ẩn không chiếm chỗ

- **WHEN** người dùng ở mức T0 có 9 tin đang hiển thị và 3 tin tạm ẩn vì nhóm bị khoá gửi một tin mới
- **THEN** tin được gửi

#### Scenario: Tin đã xong không chiếm chỗ

- **WHEN** người dùng ở mức T0 có 9 tin đang hiển thị, 5 tin đã bán, 5 tin hết hạn và 3 nháp gửi một tin mới
- **THEN** tin được gửi

#### Scenario: Tin chờ duyệt đã rời nhóm không chiếm chỗ

- **WHEN** người dùng ở mức T0 có 9 tin đang hiển thị và 1 tin chờ duyệt trong một nhóm đã đóng gửi một tin mới
- **THEN** tin được gửi
