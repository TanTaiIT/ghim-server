# platform/audit-log Specification

## Purpose

Ghi mọi thao tác của master và staff ở bàn vận hành thành một nhật ký giữ mãi, không ai sửa được, không chứa
nội dung tin — cách kiểm soát duy nhất với master (TK 1 quyết định 4, nguyên tắc 3, nguyên tắc 9).

## Requirements

### Requirement: Mọi thao tác của master vào nhật ký

Mỗi thao tác thay đổi dữ liệu do master làm SHALL ghi một dòng nhật ký gồm người làm, thời điểm, hành động,
đối tượng và lý do nếu có. Dòng nhật ký MUST được ghi cùng lượt với thay đổi: không ghi được nhật ký thì thay
đổi không xảy ra.

#### Scenario: Master khoá tài khoản

- **WHEN** master khoá một tài khoản kèm lý do
- **THEN** nhật ký có đúng một dòng ghi master đó, thời điểm, hành động khoá, tài khoản bị khoá và lý do

#### Scenario: Master đổi bảng con số

- **WHEN** master đổi một con số và tạo phiên bản mới của bảng con số
- **THEN** nhật ký có một dòng ghi master đó, hành động đổi bảng con số và số phiên bản mới

#### Scenario: Không ghi được nhật ký

- **WHEN** master gắn quyền staff cho một tài khoản nhưng dòng nhật ký không ghi được
- **THEN** response có HTTP 500 `INTERNAL_ERROR` và tài khoản không mang quyền staff

### Requirement: Thao tác của staff vào nhật ký dưới tên người làm

Mỗi thao tác thay đổi dữ liệu của staff ở bàn vận hành SHALL ghi nhật ký như thao tác của master, với người
làm MUST là tài khoản cá nhân của chính staff đó.

#### Scenario: Staff gỡ đánh dấu thiết bị

- **WHEN** staff có việc hỗ trợ người dùng gỡ đánh dấu thiết bị cho một tài khoản kèm lý do "máy mua lại"
- **THEN** nhật ký có một dòng ghi tài khoản cá nhân của staff đó, hành động gỡ đánh dấu, tài khoản được gỡ
  và lý do

### Requirement: Nhật ký giữ mãi, không ai sửa hay xoá

Dòng nhật ký SHALL được giữ mãi. MUST NOT có thao tác nào — của người dùng, staff hay master — sửa hay xoá
được một dòng nhật ký.

#### Scenario: Master thử xoá một dòng nhật ký

- **WHEN** master gửi yêu cầu xoá một dòng nhật ký
- **THEN** yêu cầu không được thực hiện vì không có thao tác đó (HTTP 404 `NOT_FOUND`), và dòng nhật ký vẫn
  nguyên

### Requirement: Nhật ký không chứa nội dung tin

Dòng nhật ký về một tin MUST NOT chứa tiêu đề, mô tả, giá, ảnh hay thông tin theo mẫu của tin; tin SHALL chỉ
được nhắc bằng mã tin.

#### Scenario: Ghi nhật ký một thao tác về tin

- **WHEN** một thao tác về một tin được ghi vào nhật ký
- **THEN** dòng nhật ký chỉ mang mã tin, không có tiêu đề, mô tả, giá, ảnh hay thông tin theo mẫu

### Requirement: Master tra nhật ký

Master SHALL tra được nhật ký theo người làm, theo đối tượng và theo khoảng thời gian. Chỉ master đọc được
nhật ký: staff và tài khoản không mang quyền staff MUST NOT đọc được, kể cả dòng về chính mình.

#### Scenario: Staff tra nhật ký

- **WHEN** một staff gọi thao tác tra nhật ký, kể cả lọc theo chính tài khoản của mình
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Tra theo đối tượng

- **WHEN** master tra nhật ký về một tài khoản đã bị khoá rồi mở khoá
- **THEN** response có HTTP 200 với cả dòng khoá lẫn dòng mở khoá, xếp theo thời gian

#### Scenario: Người dùng thường tra nhật ký

- **WHEN** một tài khoản không mang quyền staff gọi thao tác tra nhật ký
- **THEN** response có HTTP 403 `FORBIDDEN`
