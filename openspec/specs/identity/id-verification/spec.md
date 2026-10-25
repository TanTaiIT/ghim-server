# identity/id-verification Specification

## Purpose

Cho người dùng tự nguyện xác minh giấy tờ như một tính năng phụ, tách hẳn khỏi luồng chính: kết quả chỉ
được lưu lại, không thay đổi bất kỳ quyền hay quyết định nào (TK 7, cam kết 32).

## Requirements

### Requirement: Nộp giấy tờ tự nguyện

Người dùng SHALL nộp được giấy tờ để xác minh khi muốn; không thao tác nào của Ghim đòi phải có xác minh.

#### Scenario: Nộp giấy tờ

- **WHEN** người dùng nộp giấy tờ
- **THEN** response có HTTP 201 và hồ sơ xác minh ở trạng thái chờ duyệt

#### Scenario: Đang có hồ sơ chờ duyệt

- **WHEN** người dùng nộp tiếp khi đang có một hồ sơ chờ duyệt
- **THEN** response có HTTP 409 `CONFLICT`

### Requirement: Ai duyệt giấy tờ

Chỉ master và staff được giao việc duyệt giấy tờ SHALL duyệt hoặc từ chối hồ sơ xác minh, kèm lý do khi từ
chối.

#### Scenario: Staff không được giao việc

- **WHEN** một staff không được giao việc duyệt giấy tờ mở hồ sơ xác minh
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Duyệt hồ sơ

- **WHEN** staff được giao việc duyệt một hồ sơ
- **THEN** hồ sơ chuyển sang đã xác minh

### Requirement: Kết quả xác minh không ảnh hưởng gì

Kết quả xác minh MUST NOT chặn ai dùng app và MUST NOT thay đổi việc đăng tin, mức tin cậy, hạn mức hay quyết
định của máy duyệt.

#### Scenario: Bị từ chối xác minh

- **WHEN** hồ sơ xác minh của một người bị từ chối
- **THEN** người đó vẫn dùng app như trước, không có quyền hay hạn mức nào đổi

### Requirement: Số giấy tờ không hiện ra ngoài

Số giấy tờ MUST NOT xuất hiện trong hồ sơ công khai hay bất kỳ response nào dành cho người dùng khác.

#### Scenario: Xem hồ sơ người đã xác minh

- **WHEN** một người khác xem hồ sơ công khai của tài khoản đã xác minh
- **THEN** response không chứa số giấy tờ

### Requirement: Không ai duyệt giấy tờ của chính mình

Staff được giao duyệt giấy tờ MUST NOT duyệt hồ sơ giấy tờ của chính mình; chỉ master được (TK 4, nguyên tắc không tự xử
việc của mình).

#### Scenario: Staff duyệt hồ sơ của chính mình

- **WHEN** staff được giao duyệt giấy tờ duyệt hồ sơ do chính mình nộp
- **THEN** response có HTTP 403 `FORBIDDEN` và hồ sơ vẫn chờ duyệt

### Requirement: Hai người cùng duyệt một hồ sơ

Hai lượt duyệt cùng một hồ sơ đang chờ SHALL có đúng một lượt thành công; lượt kia MUST NOT ghi đè kết quả.

#### Scenario: Hai staff cùng duyệt

- **WHEN** hai staff cùng lúc duyệt một hồ sơ đang chờ, một người chấp nhận và một người từ chối
- **THEN** đúng một lượt nhận HTTP 200, lượt kia nhận HTTP 409 `CONFLICT`, và hồ sơ mang kết quả của lượt thành công

### Requirement: Người nộp xem được hồ sơ của mình

Người đã đăng nhập SHALL đọc được hồ sơ xác minh nộp gần nhất của chính mình: trạng thái, lúc nộp, lúc duyệt, và lý do khi
bị từ chối. Response MUST NOT chứa số giấy tờ hay người đã duyệt.

#### Scenario: Chưa nộp lần nào

- **WHEN** người chưa từng nộp giấy tờ đọc hồ sơ xác minh của mình
- **THEN** response có HTTP 200 và không có hồ sơ nào

#### Scenario: Hồ sơ đang chờ duyệt

- **WHEN** người vừa nộp giấy tờ đọc hồ sơ xác minh của mình
- **THEN** response có HTTP 200, hồ sơ ở trạng thái chờ duyệt và không chứa số giấy tờ

#### Scenario: Hồ sơ bị từ chối

- **WHEN** hồ sơ của một người bị từ chối kèm lý do, rồi người đó đọc hồ sơ xác minh của mình
- **THEN** response có HTTP 200, hồ sơ ở trạng thái bị từ chối kèm đúng lý do và thời điểm duyệt, không nêu người duyệt

#### Scenario: Nộp lại sau khi bị từ chối

- **WHEN** người bị từ chối nộp lại giấy tờ rồi đọc hồ sơ xác minh của mình
- **THEN** response có HTTP 200 và là hồ sơ mới ở trạng thái chờ duyệt, không phải hồ sơ bị từ chối

#### Scenario: Chưa đăng nhập

- **WHEN** khách đọc hồ sơ xác minh
- **THEN** response có HTTP 401 `UNAUTHORIZED`
