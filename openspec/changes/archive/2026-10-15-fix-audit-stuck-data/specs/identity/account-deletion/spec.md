## MODIFIED Requirements

### Requirement: Email của tài khoản đã xoá chưa dùng lại được trong thời gian chờ xoá hẳn

Trong 90 ngày (giá trị khởi đầu) kể từ khi xoá, tài khoản vẫn nằm đó ở dạng ẩn nên luật "mỗi email một tài
khoản" vẫn áp: email đó MUST NOT đăng ký lại được, và lượt từ chối SHALL nói rõ ngày được đăng ký lại. Hết
thời gian chờ, email đăng ký lại được như email mới; tài khoản cũ vẫn ở trạng thái đã xoá, mất email, tên, ảnh
và mật khẩu, nhưng lịch sử chống gian lận của nó được giữ (chốt 15/10/2026).

#### Scenario: Đăng ký lại trong thời gian chờ

- **WHEN** một tài khoản đã xoá 10 ngày trước và ai đó đăng ký bằng cùng email (sau chuẩn hoá)
- **THEN** response có HTTP 409 `EMAIL_PENDING_DELETION` kèm ngày được đăng ký lại

#### Scenario: Đăng ký lại sau thời gian chờ

- **WHEN** một tài khoản đã xoá quá 90 ngày và ai đó đăng ký bằng cùng email
- **THEN** tài khoản mới được tạo như với một email chưa từng có, tài khoản cũ vẫn ở trạng thái đã xoá không còn
  email, tên hay mật khẩu, và tin cũ của nó vẫn không hiện

## ADDED Requirements

### Requirement: Người dùng Google đã xoá tài khoản

Người đã xoá tài khoản mà đăng nhập lại bằng Google SHALL được đối xử như người đăng ký lại bằng cùng email: trong
thời gian chờ thì bị từ chối kèm ngày đăng ký lại được; hết thời gian chờ thì Google tạo một tài khoản mới, tài
khoản cũ vẫn ở trạng thái đã xoá (chốt 15/10/2026).

#### Scenario: Đăng nhập Google trong thời gian chờ

- **WHEN** người dùng Google đã xoá tài khoản 10 ngày trước đăng nhập lại bằng Google
- **THEN** response có HTTP 409 `EMAIL_PENDING_DELETION` kèm ngày được đăng ký lại

#### Scenario: Đăng nhập Google sau thời gian chờ

- **WHEN** người dùng Google đã xoá tài khoản quá 90 ngày đăng nhập lại bằng Google
- **THEN** một tài khoản mới đã xác nhận được tạo và tài khoản cũ vẫn ở trạng thái đã xoá
