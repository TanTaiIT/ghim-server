## Purpose

Cho điều hành nhóm đẩy một tin trái quy định sàn lên người có quyền xử trên toàn sàn, mà không để nhóm tự phạt
hay đụng tới tài khoản toàn hệ thống của ai (TK 17, TK 6, cam kết 6).

## ADDED Requirements

### Requirement: Điều hành nhóm chuyển tin trái quy định sàn lên staff

Khi gỡ một tin khỏi nhóm, điều hành viên hoặc chủ nhóm SHALL đánh dấu được "trái quy định sàn" kèm lý do; khi
đó hệ thống sinh một việc hàng 4 về tin đó. Tin rời nhóm ngay theo quyết định của nhóm, MUST NOT chờ việc hàng
4 được xử.

#### Scenario: Chuyển lên

- **WHEN** điều hành viên gỡ khỏi nhóm một tin bán hàng giả, đánh dấu "trái quy định sàn" kèm lý do
- **THEN** tin rời nhóm ngay và có một việc hàng 4 về tin đó với hạn xử 72 giờ

#### Scenario: Chuyển lên mà thiếu lý do

- **WHEN** điều hành viên đánh dấu "trái quy định sàn" mà bỏ trống lý do
- **THEN** response có HTTP 400 `VALIDATION_ERROR`, tin không đổi và không có việc hàng 4 nào

### Requirement: Staff xem việc nhóm chuyển lên

Staff được giao danh mục của tin hoặc master SHALL xử việc hàng 4. Kết quả "bác" SHALL đóng việc; tin vẫn
nằm ngoài nhóm như nhóm đã quyết và người đăng không chịu thêm hệ quả nào.

#### Scenario: Staff bác

- **WHEN** staff bác một việc hàng 4
- **THEN** việc đóng, tin vẫn không thuộc nhóm, và mức tin cậy, hạn mức của người đăng không đổi

#### Scenario: Điều hành viên mở việc hàng 4

- **WHEN** một điều hành viên không mang quyền staff nhận một việc hàng 4 bằng mã việc
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Quyết định của điều hành nhóm chỉ có tác dụng trong nhóm

Quyết định của điều hành viên và chủ nhóm MUST NOT ra gậy và MUST NOT thay đổi gì trên tài khoản toàn hệ thống
của ai: mức tin cậy, hạn mức, tin ở sàn chung hay ở nhóm khác. Muốn có hệ quả ngoài nhóm thì nhóm SHALL chuyển
lên hàng 4.

#### Scenario: Gỡ khỏi nhóm và chuyển lên

- **WHEN** điều hành viên gỡ khỏi nhóm và chuyển lên một tin của người dùng T2 đang có tin hiện ở sàn chung
- **THEN** trong lúc việc hàng 4 còn mở, người đó vẫn ở T2, hạn mức tin sống tối đa không đổi và tin ở sàn
  chung vẫn hiện như cũ
