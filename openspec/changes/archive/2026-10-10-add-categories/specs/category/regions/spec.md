## Purpose

Cung cấp danh sách khu vực hành chính sau sáp nhập — tỉnh, thành và phường, xã — để tin đăng ghi nơi bán và
người mua lọc, tìm đồ gần mình, kể cả khi chỉ nhớ tên cũ (TK 11).

## ADDED Requirements

### Requirement: Danh sách khu vực sau sáp nhập

Hệ thống SHALL có danh sách 34 tỉnh, thành và 3.321 phường, xã sau sáp nhập; mỗi phường, xã MUST thuộc đúng
một tỉnh, thành. Mọi người, kể cả khách, đọc được danh sách này.

#### Scenario: Khách xem danh sách tỉnh

- **WHEN** khách xem danh sách tỉnh, thành
- **THEN** response có HTTP 200 với 34 tỉnh, thành

#### Scenario: Phường của một tỉnh

- **WHEN** khách xem danh sách phường, xã của Thành phố Hồ Chí Minh
- **THEN** response chỉ có phường, xã thuộc Thành phố Hồ Chí Minh, trong đó có phường Bến Thành

#### Scenario: Tỉnh không tồn tại

- **WHEN** khách xem danh sách phường, xã của một mã tỉnh không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Tìm khu vực bằng tên cũ

Tìm khu vực bằng tên trước sáp nhập SHALL trả về đơn vị mới đang chứa nơi đó. Tên cũ ứng với nhiều đơn vị
mới thì MUST trả về mọi đơn vị đó.

#### Scenario: Tên tỉnh cũ

- **WHEN** khách tìm khu vực "Bình Dương"
- **THEN** kết quả có Thành phố Hồ Chí Minh

#### Scenario: Tên cũ chia cho nhiều đơn vị mới

- **WHEN** khách tìm tên cũ của một phường mà địa bàn nay thuộc hai phường mới
- **THEN** kết quả có cả hai phường mới

#### Scenario: Không có khu vực nào khớp

- **WHEN** khách tìm một tên không phải tên cũ hay mới của khu vực nào
- **THEN** response có HTTP 200 với danh sách rỗng
