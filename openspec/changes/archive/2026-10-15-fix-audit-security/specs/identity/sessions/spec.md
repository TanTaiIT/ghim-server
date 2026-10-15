## MODIFIED Requirements

### Requirement: Đăng nhập hai lớp cho master và staff

Tài khoản master và tài khoản mang quyền staff SHALL đăng nhập hai lớp bằng ứng dụng tạo mã. Chưa thiết lập
lớp thứ hai thì không làm được thao tác nào của bàn vận hành. Lớp thứ hai đã bật thì MUST NOT thiết lập lại được
qua app: mất hay muốn đổi ứng dụng tạo mã thì đội kỹ thuật đặt lại bằng công cụ chạy tay (chốt 15/10/2026).

#### Scenario: Staff đăng nhập đủ hai lớp

- **WHEN** tài khoản mang quyền staff nhập đúng mật khẩu và đúng mã từ ứng dụng tạo mã
- **THEN** người đó vào được bàn vận hành

#### Scenario: Sai mã lớp thứ hai

- **WHEN** tài khoản mang quyền staff nhập đúng mật khẩu nhưng sai mã lớp thứ hai
- **THEN** response có HTTP 401 `INVALID_CREDENTIALS` và không có phiên nào được tạo

#### Scenario: Chưa thiết lập lớp thứ hai

- **WHEN** tài khoản vừa được gắn quyền staff, chưa thiết lập ứng dụng tạo mã, gọi một thao tác của bàn
  vận hành
- **THEN** response có HTTP 403 `TWO_FACTOR_REQUIRED`

#### Scenario: Thiết lập lại khi đã bật

- **WHEN** staff đã bật lớp thứ hai gọi thiết lập lớp thứ hai lần nữa
- **THEN** response có HTTP 409 `TWO_FACTOR_ENABLED`, ứng dụng tạo mã cũ vẫn là lớp thứ hai, và đăng nhập vẫn đòi
  mã của nó

#### Scenario: Đội kỹ thuật đặt lại rồi thiết lập lại

- **WHEN** đội kỹ thuật đặt lại lớp thứ hai của một staff, rồi staff đăng nhập bằng mật khẩu và thiết lập ứng
  dụng tạo mã mới
- **THEN** thiết lập thành công và từ đó đăng nhập đòi mã của ứng dụng mới
