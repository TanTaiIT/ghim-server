## Purpose

Cho master lập nhóm — bảng tin riêng của một trường, công ty hay cộng đồng — và đưa nhóm qua các trạng thái
từ chờ giao chủ tới đóng hẳn, chỉ theo những đường đã định (TK 9, TK 10).

## ADDED Requirements

### Requirement: Chỉ master lập nhóm

Chỉ master SHALL lập được nhóm, kèm tên, loại nhóm (trường học, công ty, cộng đồng, khác), chế độ và mô tả tuỳ
chọn (tối đa 1000 ký tự). Nhóm mới lập MUST ở trạng thái "chờ giao chủ".

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

#### Scenario: Mô tả quá dài

- **WHEN** master lập nhóm với mô tả 1001 ký tự
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

Chỉ master SHALL tạm khoá một nhóm đang hoạt động hoặc đang thiếu chủ, kèm lý do, và mở khoá một nhóm đang tạm
khoá. Lý do khoá MUST chỉ chủ nhóm, điều hành viên và master thấy. Khoá và mở khoá MUST NOT làm đổi thành viên,
vai hay cài đặt của nhóm. Master MUST NOT mở khoá được nhóm chưa có chủ nhóm dùng được.

#### Scenario: Master khoá nhóm

- **WHEN** master khoá một nhóm đang hoạt động
- **THEN** nhóm chuyển sang tạm khoá

#### Scenario: Mở khoá nhóm có chủ

- **WHEN** master mở khoá một nhóm có chủ đang tạm khoá
- **THEN** nhóm trở lại đang hoạt động với đúng thành viên, vai và cài đặt như lúc bị khoá

#### Scenario: Chủ nhóm thử khoá nhóm

- **WHEN** chủ nhóm gọi thao tác tạm khoá nhóm của mình
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Khoá không ghi lý do

- **WHEN** master khoá một nhóm mà bỏ trống lý do
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và nhóm vẫn đang hoạt động

#### Scenario: Khoá nhóm đang thiếu chủ

- **WHEN** master khoá một nhóm đang thiếu chủ
- **THEN** nhóm chuyển sang tạm khoá

#### Scenario: Mở khoá nhóm chưa có chủ dùng được

- **WHEN** master mở khoá một nhóm đang tạm khoá mà chủ nhóm vẫn đang bị khoá tài khoản
- **THEN** response có HTTP 409 `GROUP_OWNER_REQUIRED` và nhóm vẫn tạm khoá

#### Scenario: Thành viên thường xem nhóm bị khoá

- **WHEN** một thành viên không có vai mở hồ sơ một nhóm đang tạm khoá
- **THEN** hồ sơ cho biết nhóm đang tạm khoá và không có lý do khoá

### Requirement: Đóng nhóm là vĩnh viễn

Chủ nhóm hoặc master SHALL đóng được nhóm đang hoạt động hoặc đang tạm khoá; master SHALL đóng được cả nhóm
đang chờ giao chủ. Đóng là vĩnh viễn: MUST NOT có thao tác nào mở lại nhóm đã đóng; muốn có lại thì master lập
một nhóm mới.

#### Scenario: Chủ nhóm đóng nhóm

- **WHEN** chủ nhóm đóng nhóm đang hoạt động của mình
- **THEN** nhóm chuyển sang đã đóng

#### Scenario: Master huỷ nhóm chưa có chủ

- **WHEN** master đóng một nhóm đang chờ giao chủ
- **THEN** nhóm chuyển sang đã đóng và lời giao chủ đang chờ của nhóm bị huỷ

#### Scenario: Điều hành viên thử đóng nhóm

- **WHEN** một điều hành viên gọi thao tác đóng nhóm
- **THEN** response có HTTP 403 `FORBIDDEN` và nhóm giữ nguyên trạng thái

#### Scenario: Thao tác trên nhóm đã đóng

- **WHEN** chủ cũ đổi chế độ của một nhóm đã đóng
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT`

### Requirement: Đóng nhóm huỷ đơn, lời mời và mã nhóm

Khi nhóm đóng, mọi đơn xin vào đang chờ, mọi lời mời còn hạn, lời giao chủ đang chờ và mã nhóm SHALL bị huỷ
ngay.

#### Scenario: Nhận lời mời sau khi nhóm đóng

- **WHEN** một người nhận lời mời còn hạn của nhóm vừa đóng
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT` và người đó không thành thành viên

#### Scenario: Nhập mã của nhóm đã đóng

- **WHEN** một người nhập mã của nhóm đã đóng
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Đơn đang chờ

- **WHEN** nhóm đóng trong lúc có đơn xin vào đang chờ
- **THEN** đơn đó bị huỷ và không còn tính vào số đơn đang chờ của người xin

### Requirement: Nhóm tạm khoá chỉ đọc

Trong lúc nhóm tạm khoá, người trong nhóm MUST NOT duyệt đơn, mời, gỡ, cấm, xếp đơn vị, đổi cài đặt hay gửi
thông báo của nhóm. Chủ nhóm và master SHALL vẫn đóng được nhóm.

#### Scenario: Duyệt đơn khi nhóm khoá

- **WHEN** điều hành viên duyệt một đơn đang chờ của nhóm đang tạm khoá
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT` và người xin không thành thành viên

#### Scenario: Đổi cài đặt khi nhóm khoá

- **WHEN** chủ nhóm đổi kiểu bảng tin của nhóm đang tạm khoá
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT` và cài đặt không đổi

#### Scenario: Đóng nhóm khi đang khoá

- **WHEN** chủ nhóm đóng nhóm của mình đang tạm khoá
- **THEN** nhóm chuyển sang đã đóng
