## Purpose

Quyết một tin nằm ở đâu và mô tả món đồ theo khuôn chung: nơi đăng do người đăng tự chọn, tư cách trong nhóm,
danh mục và mẫu thông tin, giá, khu vực (TK 9, TK 10, TK 11, TK 12).

## ADDED Requirements

### Requirement: Người đăng phải chọn nơi đăng

Mỗi tin SHALL có đúng một nơi đăng do người đăng chọn: "sàn chung", "nhóm công khai" hoặc "chỉ thành viên". Hệ
thống MUST NOT tự chọn hay đoán nơi đăng thay người đăng.

#### Scenario: Gửi khi chưa chọn nơi đăng

- **WHEN** một người dùng là thành viên đúng một nhóm gửi nháp chưa chọn nơi đăng
- **THEN** response có HTTP 400 `VALIDATION_ERROR`, nháp vẫn là nháp, và hệ thống không tự gán sàn chung hay
  nhóm đó

#### Scenario: Chọn sàn chung

- **WHEN** người dùng chọn "sàn chung" và không chọn nhóm nào
- **THEN** tin nhận nơi đăng "sàn chung" mà không bị đòi chọn nhóm

### Requirement: Tin trong nhóm phải chọn nhóm

Tin ở mức "nhóm công khai" hay "chỉ thành viên" SHALL gắn với đúng một nhóm do người đăng chọn.

#### Scenario: Chọn "chỉ thành viên" mà không chọn nhóm

- **WHEN** người dùng gửi nháp ở mức "chỉ thành viên" mà không chọn nhóm
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và nháp vẫn là nháp

#### Scenario: Nhóm không tồn tại

- **WHEN** người dùng gửi nháp vào một mã nhóm không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Mức "chỉ thành viên" chỉ dành cho thành viên

Chỉ người đang là thành viên của nhóm SHALL đăng được tin "chỉ thành viên" vào nhóm đó.

#### Scenario: Thành viên đăng "chỉ thành viên"

- **WHEN** thành viên của nhóm gửi tin "chỉ thành viên" vào nhóm
- **THEN** tin được gửi và chuyển sang đang kiểm

#### Scenario: Người không phải thành viên đăng "chỉ thành viên"

- **WHEN** một người không phải thành viên gửi tin "chỉ thành viên" vào nhóm
- **THEN** response có HTTP 403 `NOT_GROUP_MEMBER` và nháp vẫn là nháp

### Requirement: Nhóm riêng tư không có mức "nhóm công khai"

Tin trong nhóm riêng tư MUST NOT ở mức "nhóm công khai", dù người đăng là thành viên hay người ngoài.

#### Scenario: Thành viên nhóm riêng tư chọn "nhóm công khai"

- **WHEN** thành viên của một nhóm riêng tư gửi tin mức "nhóm công khai" vào nhóm đó
- **THEN** response có HTTP 409 `PLACEMENT_NOT_ALLOWED` và nháp vẫn là nháp

### Requirement: Người ngoài gửi tin vào nhóm

Người không phải thành viên SHALL chỉ gửi được tin vào nhóm công khai đang bật "nhận tin người ngoài", và chỉ ở
mức "nhóm công khai". Tin của người ngoài qua máy duyệt như mọi tin.

#### Scenario: Nhóm nhận tin người ngoài

- **WHEN** người ngoài gửi tin mức "nhóm công khai" vào một nhóm công khai đang bật nhận tin người ngoài
- **THEN** tin được gửi và chuyển sang đang kiểm

#### Scenario: Nhóm không nhận tin người ngoài

- **WHEN** người ngoài gửi tin vào một nhóm công khai đang tắt nhận tin người ngoài
- **THEN** response có HTTP 403 `OUTSIDER_POSTS_DISABLED` và nháp vẫn là nháp

### Requirement: Người bị cấm không gửi tin vào nhóm

Người bị cấm khỏi một nhóm MUST NOT gửi tin vào nhóm đó ở bất kỳ mức nào, kể cả theo đường người ngoài.

#### Scenario: Người bị cấm gửi theo đường người ngoài

- **WHEN** người đã bị cấm khỏi một nhóm công khai đang bật nhận tin người ngoài gửi tin vào nhóm đó
- **THEN** response có HTTP 403 `GROUP_BANNED` và nháp vẫn là nháp

### Requirement: Nhóm tạm khoá hay đã đóng không nhận tin

Nhóm đang tạm khoá hoặc đã đóng MUST NOT nhận tin mới, kể cả tin được đổi nơi đăng vào nhóm.

#### Scenario: Gửi vào nhóm đang tạm khoá

- **WHEN** thành viên gửi tin vào nhóm đang tạm khoá
- **THEN** response có HTTP 409 `GROUP_LOCKED` và nháp vẫn là nháp

#### Scenario: Gửi vào nhóm đã đóng

- **WHEN** người dùng gửi tin vào một nhóm đã đóng
- **THEN** response có HTTP 409 `GROUP_CLOSED` và nháp vẫn là nháp

### Requirement: Tin tự gắn đơn vị con của người đăng

Ở nhóm có đơn vị con (lớp, phòng ban), tin trong nhóm của một thành viên đã được xếp vào đơn vị SHALL tự gắn
đơn vị đó.

#### Scenario: Học sinh lớp 10A đăng tin trong nhóm trường

- **WHEN** thành viên được xếp vào lớp 10A gửi tin "chỉ thành viên" vào nhóm trường
- **THEN** tin mang đơn vị lớp 10A mà người đăng không phải chọn

### Requirement: Danh mục phải đang bật

Mỗi tin SHALL thuộc đúng một danh mục. Danh mục đang tắt MUST NOT nhận tin mới hay tin được đổi sang.

#### Scenario: Gửi không chọn danh mục

- **WHEN** người dùng gửi nháp chưa chọn danh mục
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và nháp vẫn là nháp

#### Scenario: Gửi vào danh mục đang tắt

- **WHEN** người dùng gửi nháp thuộc một danh mục đang tắt
- **THEN** response có HTTP 409 `CATEGORY_DISABLED` và nháp vẫn là nháp

#### Scenario: Đổi tin sang danh mục đang tắt

- **WHEN** người đăng sửa một tin đang hiển thị sang một danh mục đang tắt
- **THEN** response có HTTP 409 `CATEGORY_DISABLED` và tin không đổi

### Requirement: Thông tin theo mẫu của danh mục

Thông tin món đồ SHALL điền theo mẫu thông tin đang phát hành của danh mục; mục không có trong mẫu MUST bị từ
chối. Tin giữ nguyên phiên bản mẫu lúc đăng — mẫu phát hành sau không đổi tin đã đăng, và sửa thông tin theo
mẫu của tin đã đăng SHALL theo phiên bản tin đang mang (TK 11, chốt 12/10/2026).

#### Scenario: Điền mục không có trong mẫu

- **WHEN** người dùng gửi tin danh mục Điện thoại kèm một mục không có trong mẫu của danh mục đó
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Danh mục phát hành mẫu mới

- **WHEN** master phát hành phiên bản mẫu mới có thêm một mục cho danh mục Xe máy
- **THEN** tin Xe máy đã đăng trước đó vẫn hiện theo mẫu lúc đăng, không bị đòi điền mục mới và không đổi
  trạng thái

#### Scenario: Sửa tin cũ sau khi có mẫu mới

- **WHEN** người đăng sửa một tin Xe máy đăng theo mẫu cũ và điền mục chỉ có ở phiên bản mẫu mới
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và tin không đổi

### Requirement: Giá là số nguyên đồng, 0 là cho tặng

Giá SHALL là số nguyên từ 0 trở lên, đơn vị đồng. Giá 0 nghĩa là cho tặng (app hiện "Miễn phí"), MUST NOT bị
coi là thiếu giá.

#### Scenario: Giá âm

- **WHEN** người dùng gửi tin với giá -1000
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Giá có phần lẻ

- **WHEN** người dùng gửi tin với giá 2500000.5
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Cho tặng

- **WHEN** người dùng gửi tin với giá 0
- **THEN** tin được nhận với giá 0 là đồ cho tặng, không bị báo thiếu giá

### Requirement: Khu vực

Tin sàn chung MUST có tỉnh và phường; tin trong nhóm được bỏ trống khu vực. Khu vực đã chọn SHALL có trong danh
sách khu vực, và phường phải thuộc tỉnh đã chọn.

#### Scenario: Tin sàn chung thiếu phường

- **WHEN** người dùng gửi tin sàn chung chỉ có tỉnh, chưa có phường
- **THEN** response có HTTP 400 `REGION_REQUIRED` và nháp vẫn là nháp

#### Scenario: Phường không thuộc tỉnh

- **WHEN** người dùng gửi tin với một phường không thuộc tỉnh đã chọn
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Tin trong nhóm không có khu vực

- **WHEN** thành viên gửi tin "chỉ thành viên" không có tỉnh, phường
- **THEN** tin không bị báo thiếu khu vực
