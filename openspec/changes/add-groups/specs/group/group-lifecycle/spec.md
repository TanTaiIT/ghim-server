## Purpose

Cho master lập nhóm — bảng tin riêng của một trường, công ty hay cộng đồng — và đưa nhóm qua các trạng thái
từ chờ giao chủ tới đóng hẳn, chỉ theo những đường đã định (TK 9, TK 10).

## ADDED Requirements

### Requirement: Chỉ master lập nhóm

Chỉ master SHALL lập được nhóm, kèm tên, loại nhóm (trường học, công ty, cộng đồng, khác) và chế độ. Nhóm
mới lập MUST ở trạng thái "chờ giao chủ".

#### Scenario: Master lập nhóm

- **WHEN** master lập nhóm "THPT Lê Quý Đôn", loại trường học, chế độ công khai · xét duyệt
- **THEN** response có HTTP 201 và nhóm ở trạng thái chờ giao chủ

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

### Requirement: Loại nhóm chỉ để chọn sẵn cài đặt

Loại nhóm SHALL chỉ dùng để điền sẵn cài đặt lúc lập. Cài đặt đổi về sau MUST NOT bị loại nhóm chặn.

#### Scenario: Đổi cài đặt khác với cài đặt chọn sẵn

- **WHEN** chủ của một nhóm loại công ty đổi một cài đặt khác với giá trị đã được chọn sẵn lúc lập
- **THEN** thay đổi được chấp nhận như ở mọi loại nhóm khác

### Requirement: Trạng thái nhóm chỉ đổi theo đường đã định

Nhóm SHALL luôn ở đúng một trong sáu trạng thái: chờ giao chủ, đang hoạt động, đang chuyển sang riêng tư,
thiếu chủ, tạm khoá, đã đóng. Thao tác không hợp với trạng thái hiện tại MUST bị từ chối và trạng thái giữ
nguyên.

#### Scenario: Mở khoá nhóm không bị khoá

- **WHEN** master mở khoá một nhóm đang hoạt động
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT` và nhóm vẫn đang hoạt động

#### Scenario: Khoá nhóm đã đóng

- **WHEN** master khoá một nhóm đã đóng
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT` và nhóm vẫn đã đóng

### Requirement: Master tạm khoá và mở khoá nhóm

Chỉ master SHALL tạm khoá một nhóm đang hoạt động và mở khoá một nhóm đang tạm khoá. Khoá và mở khoá MUST NOT
làm đổi thành viên, vai hay cài đặt của nhóm.

#### Scenario: Master khoá nhóm

- **WHEN** master khoá một nhóm đang hoạt động
- **THEN** nhóm chuyển sang tạm khoá

#### Scenario: Mở khoá nhóm có chủ

- **WHEN** master mở khoá một nhóm có chủ đang tạm khoá
- **THEN** nhóm trở lại đang hoạt động với đúng thành viên, vai và cài đặt như lúc bị khoá

#### Scenario: Chủ nhóm thử khoá nhóm

- **WHEN** chủ nhóm gọi thao tác tạm khoá nhóm của mình
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Đóng nhóm là vĩnh viễn

Chủ nhóm hoặc master SHALL đóng được nhóm đang hoạt động hoặc đang tạm khoá. Đóng là vĩnh viễn: MUST NOT có
thao tác nào mở lại nhóm đã đóng; muốn có lại thì master lập một nhóm mới.

#### Scenario: Chủ nhóm đóng nhóm

- **WHEN** chủ nhóm đóng nhóm đang hoạt động của mình
- **THEN** nhóm chuyển sang đã đóng

#### Scenario: Điều hành viên thử đóng nhóm

- **WHEN** một điều hành viên gọi thao tác đóng nhóm
- **THEN** response có HTTP 403 `FORBIDDEN` và nhóm giữ nguyên trạng thái

#### Scenario: Thao tác trên nhóm đã đóng

- **WHEN** chủ cũ đổi chế độ của một nhóm đã đóng
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT`

### Requirement: Đóng nhóm huỷ đơn, lời mời và mã nhóm

Khi nhóm đóng, mọi đơn xin vào đang chờ, mọi lời mời còn hạn và mã nhóm SHALL bị huỷ ngay.

#### Scenario: Nhận lời mời sau khi nhóm đóng

- **WHEN** một người nhận lời mời còn hạn của nhóm vừa đóng
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT` và người đó không thành thành viên

#### Scenario: Nhập mã của nhóm đã đóng

- **WHEN** một người nhập mã của nhóm đã đóng
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Đơn đang chờ

- **WHEN** nhóm đóng trong lúc có đơn xin vào đang chờ
- **THEN** đơn đó bị huỷ và không còn tính vào số đơn đang chờ của người xin
