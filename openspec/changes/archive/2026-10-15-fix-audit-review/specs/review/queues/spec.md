## ADDED Requirements

### Requirement: Người bị khoá không nhận việc của nhóm

Điều hành viên hay chủ nhóm có tài khoản bị khoá MUST NOT được tính là người xử việc của nhóm, và nhóm đang thiếu
chủ không có chủ để chuyển việc tới: việc đi tiếp theo chuỗi chuyển tiếp như khi không có người đó (chốt
15/10/2026).

#### Scenario: Điều hành viên duy nhất của lớp bị khoá

- **WHEN** tin của thành viên lớp 10A bị máy giữ và điều hành viên duy nhất của lớp 10A đang bị khoá
- **THEN** việc hiện trong hàng của điều hành viên cấp cả nhóm

### Requirement: Xoá tài khoản thì việc về tin của người đó bị huỷ

Khi người đăng xoá tài khoản, mọi việc đang mở về tin của người đó SHALL bị huỷ: tin không còn hiện với ai, và master
MUST NOT bị nhắc vì việc đó (chốt 15/10/2026).

#### Scenario: Người đăng xoá tài khoản khi tin đang chờ duyệt

- **WHEN** tin sàn của một người đang chờ duyệt và người đó xoá tài khoản
- **THEN** việc về tin đó bị huỷ, và sau 73 giờ master không được nhắc vì nó

### Requirement: Việc theo trạng thái hiện tại của tin

Việc SHALL theo trạng thái hiện tại của tin: một thay đổi cũ được hệ thống xử lại sau thay đổi mới hơn của tin MUST
NOT sinh, huỷ hay đổi việc (chốt 15/10/2026).

#### Scenario: Lượt "giữ" được xử lại sau khi rút về nháp

- **WHEN** tin bị máy giữ, người đăng rút về nháp, rồi hệ thống xử lại lượt "giữ"
- **THEN** tin nháp không có việc nào đang mở

### Requirement: Tin rời nhóm hẳn hay bị cấm thì việc của nhóm bị huỷ

Tin rời nhóm hẳn (nhóm sang riêng tư, bị gỡ khỏi nhóm) SHALL không còn việc của nhóm — chỉ còn việc điều hành nhóm
chuyển lên staff. Người ngoài bị cấm khỏi nhóm thì việc máy giữ về tin của họ trong nhóm SHALL bị huỷ; gỡ cấm thì
việc được sinh lại (chốt 15/10/2026).

#### Scenario: Cấm người ngoài có tin chờ duyệt

- **WHEN** người ngoài có một tin "nhóm công khai" đang chờ duyệt bị cấm khỏi nhóm
- **THEN** việc về tin đó bị huỷ; gỡ cấm thì tin có một việc hàng 0 mới

### Requirement: Việc theo đơn vị hiện tại của người đăng

Thành viên được chuyển sang đơn vị khác thì việc đang mở về tin của họ trong nhóm SHALL đi theo đơn vị mới (chốt
15/10/2026).

#### Scenario: Chuyển từ lớp 10A sang 10B

- **WHEN** tin chờ duyệt của một thành viên lớp 10A có việc đang mở, rồi thành viên đó được chuyển sang lớp 10B
- **THEN** việc hiện trong hàng của điều hành viên lớp 10B và không còn trong hàng của điều hành viên lớp 10A

### Requirement: Nhắc master nêu đủ số việc, tối đa một lần mỗi ngày

Lượt nhắc master về việc quá hạn ở hàng master SHALL nêu tổng số việc đang quá hạn ở đó, và cảnh báo nhắc master
(nhắc hạn, việc sắp chạm hạn) MUST NOT bật lại quá một lần mỗi 24 giờ (chốt 15/10/2026).

#### Scenario: Thêm một việc quá hạn

- **WHEN** đã có 3 việc ở hàng master quá 72 giờ và một việc thứ tư vừa quá 72 giờ
- **THEN** thông báo chưa đọc của master nêu 4 việc, và không có cảnh báo mới trong 24 giờ
