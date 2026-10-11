## ADDED Requirements

### Requirement: Danh mục và mẫu cho phép giữ lại có hạn

Danh sách danh mục đang bật và mẫu thông tin hiện hành SHALL cho phép app và máy chủ trung gian giữ lại tối đa
5 phút: master tắt một danh mục hay phát hành một mẫu thì app thấy chậm nhiều nhất 5 phút. Một phiên bản mẫu đã
phát hành SHALL cho phép giữ lại mãi, vì nó không bao giờ đổi. Danh sách danh mục công khai MUST chỉ dựa trên
mã, tên và số phiên bản mẫu hiện hành.

#### Scenario: Danh sách danh mục

- **WHEN** khách đọc danh sách danh mục đang bật
- **THEN** response có HTTP 200 và cho phép giữ lại tối đa 5 phút

#### Scenario: Mẫu hiện hành

- **WHEN** khách đọc mẫu hiện hành của danh mục Điện thoại
- **THEN** response có HTTP 200 và cho phép giữ lại tối đa 5 phút

#### Scenario: Phiên bản mẫu đã phát hành

- **WHEN** khách đọc phiên bản mẫu 1 của danh mục Điện thoại
- **THEN** response có HTTP 200 và cho phép giữ lại mãi

#### Scenario: Danh mục ở bàn vận hành

- **WHEN** master xem danh sách danh mục ở bàn vận hành
- **THEN** response có HTTP 200 và cấm giữ lại
