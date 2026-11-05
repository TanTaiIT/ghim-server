# group/group-lifecycle Spec Delta

## MODIFIED Requirements

### Requirement: Chỉ master lập nhóm

Chỉ master SHALL lập được nhóm, kèm tên, loại nhóm (trường học, công ty, cộng đồng, khác), chế độ,
mô tả tuỳ chọn (tối đa 1000 ký tự) và tỉnh/thành tuỳ chọn. Nhóm mới lập MUST ở trạng thái "chờ giao
chủ". Thiếu tỉnh/thành thì nhóm không gắn tỉnh (nhóm toàn quốc).

#### Scenario: Master lập nhóm

- **WHEN** master lập nhóm "THPT Lê Quý Đôn", loại trường học, chế độ công khai · xét duyệt
- **THEN** response có HTTP 201 và nhóm ở trạng thái chờ giao chủ

#### Scenario: Master lập nhóm kèm tỉnh/thành

- **WHEN** master lập nhóm kèm một tỉnh/thành có thật
- **THEN** response có HTTP 201 và hồ sơ nhóm trả đúng tỉnh/thành đó

#### Scenario: Master lập nhóm không chọn tỉnh/thành

- **WHEN** master lập nhóm mà không chọn tỉnh/thành
- **THEN** response có HTTP 201 và hồ sơ nhóm không có tỉnh/thành

#### Scenario: Lập nhóm với tỉnh/thành không có thật

- **WHEN** master lập nhóm kèm một mã tỉnh/thành không tồn tại
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không nhóm nào được lập

#### Scenario: Người dùng thử lập nhóm

- **WHEN** một người dùng gọi thao tác lập nhóm
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Staff thử lập nhóm

- **WHEN** một tài khoản mang quyền staff gọi thao tác lập nhóm
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Loại nhóm không có trong danh sách

- **WHEN** master lập nhóm với một loại nhóm ngoài bốn loại trên
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Thiếu tên nhóm

- **WHEN** master lập nhóm mà bỏ trống tên
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Mô tả quá dài

- **WHEN** master lập nhóm với mô tả 1001 ký tự
- **THEN** response có HTTP 400 `VALIDATION_ERROR`
