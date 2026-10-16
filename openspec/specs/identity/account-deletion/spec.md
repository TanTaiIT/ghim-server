# identity/account-deletion Specification

## Purpose

Cho người dùng tự rời Ghim, nhưng không cho dùng việc xoá tài khoản để thoát một xử lý đang chờ (TK 7).

## Requirements

### Requirement: Người dùng tự xoá tài khoản

Người dùng SHALL tự xoá được tài khoản của mình. Xoá xong thì tài khoản không đăng nhập được và hồ sơ công
khai không còn hiện.

#### Scenario: Xoá thành công

- **WHEN** người dùng không vướng điều kiện chặn nào xoá tài khoản
- **THEN** mọi phiên bị thu hồi, đăng nhập lại nhận HTTP 401 `INVALID_CREDENTIALS`, và hồ sơ công khai trả
  HTTP 404 `NOT_FOUND`

### Requirement: Tài khoản đang bị khoá không tự xoá được

Tài khoản đang bị khoá MUST NOT tự xoá được — xoá là cách thoát khoá rẻ nhất nếu không có chốt này.

#### Scenario: Xoá khi đang bị khoá

- **WHEN** tài khoản đang bị khoá yêu cầu xoá (qua kênh hỗ trợ không cần đăng nhập)
- **THEN** yêu cầu bị từ chối với HTTP 409 `ACCOUNT_DELETE_BLOCKED` kèm lý do "đang bị khoá"

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

### Requirement: Chủ nhóm phải chuyển chủ trước khi xoá tài khoản

Tài khoản đang là chủ nhóm MUST NOT tự xoá được — nếu không, nhóm mất chủ mà không qua giai đoạn thiếu chủ có
master xác nhận. Chủ nhóm SHALL chuyển chủ xong rồi mới xoá được tài khoản.

#### Scenario: Chủ nhóm xin xoá tài khoản

- **WHEN** chủ của một nhóm đang hoạt động yêu cầu xoá tài khoản
- **THEN** response có HTTP 409 `ACCOUNT_DELETE_BLOCKED` kèm lý do "đang là chủ nhóm"

#### Scenario: Lời chuyển chủ chưa được nhận

- **WHEN** chủ nhóm đã gửi lời chuyển chủ nhưng người nhận chưa đồng ý, và chủ nhóm yêu cầu xoá tài khoản
- **THEN** response có HTTP 409 `ACCOUNT_DELETE_BLOCKED` kèm lý do "đang là chủ nhóm"

#### Scenario: Đã chuyển chủ xong

- **WHEN** người nhận đã đồng ý làm chủ nhóm và chủ cũ, không vướng điều kiện chặn nào khác, yêu cầu xoá tài
  khoản
- **THEN** tài khoản được xoá

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

### Requirement: Có báo cáo đang mở vẫn tự xoá được tài khoản, báo cáo vẫn được xử

Người đang bị báo cáo, hoặc có tin đang bị báo cáo, SHALL tự xoá được tài khoản nếu không vướng điều kiện chặn
nào khác — giữ người dùng lại trái ý họ là sai (TK 7, cam kết 13). Việc xoá MUST NOT đóng báo cáo: trong 90 ngày
tài khoản ẩn, người xử SHALL xử báo cáo trên bản lưu của tin và hồ sơ, và kết quả "đúng" vẫn áp hệ quả như khi
tài khoản còn (TK 23).

#### Scenario: Tin của mình đang bị báo cáo

- **WHEN** người dùng có một tin đang có báo cáo mở, không vướng điều kiện chặn nào khác, xoá tài khoản
- **THEN** tài khoản được xoá và báo cáo về tin đó vẫn mở trong hàng chờ

#### Scenario: Chính mình đang bị báo cáo

- **WHEN** người dùng đang bị báo cáo loại "quấy rối", báo cáo chưa đóng, xoá tài khoản
- **THEN** tài khoản được xoá và báo cáo vẫn mở trong hàng của staff được giao việc an toàn

#### Scenario: Người xử xem bản lưu

- **WHEN** staff nhận việc báo cáo về một tin của tài khoản đã xoá 20 ngày trước
- **THEN** staff thấy tiêu đề, mô tả, giá, ảnh của tin và hồ sơ người đăng như lúc tài khoản bị xoá

#### Scenario: Xử đúng sau khi tài khoản đã xoá

- **WHEN** staff được giao danh mục xác nhận đúng báo cáo về tin của một tài khoản đã xoá 30 ngày trước
- **THEN** báo cáo đóng với kết quả "đúng" và mỗi người báo được báo kết quả đó

#### Scenario: Vẫn vướng điều kiện chặn khác

- **WHEN** người dùng đang bị báo cáo và đang là chủ nhóm xoá tài khoản
- **THEN** response có HTTP 409 `ACCOUNT_DELETE_BLOCKED` kèm lý do "đang là chủ nhóm", không nêu báo cáo
