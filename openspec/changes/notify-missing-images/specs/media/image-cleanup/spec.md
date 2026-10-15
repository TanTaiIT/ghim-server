## MODIFIED Requirements

### Requirement: Đối chiếu kho ảnh hằng tháng

Mỗi tháng hệ thống SHALL đối chiếu toàn bộ kho ảnh và xoá mọi ảnh không được chủ nào còn tồn tại dùng tới, trừ ảnh
còn mang nhãn "chưa xác nhận" chưa quá 48 giờ. Ảnh đang được dùng, kể cả bởi một chủ đã xoá mềm, MUST NOT bị xoá.
Ảnh đang được dùng mà không còn trong kho SHALL được báo cho người dùng của chủ đó: ảnh của tin báo người đăng
(nhóm "tin đăng của bạn", có nhắc, nhiều ảnh mất của cùng một tin gộp thành một dòng chưa đọc), ảnh đại diện báo chủ
tài khoản (nhóm "tài khoản", có nhắc). Tin người đăng đã xoá thì không báo. Lượt đối chiếu MUST NOT tự sửa chủ — người
dùng tự thay ảnh (chốt 15/10/2026). Lượt đối chiếu bị cắt giữa chừng SHALL báo đã làm được một phần, và lượt sau làm
tiếp.

#### Scenario: Ảnh bị thay

- **WHEN** người dùng đổi ảnh đại diện sang ảnh khác, rồi lượt đối chiếu hằng tháng chạy
- **THEN** ảnh cũ bị xoá khỏi kho, ảnh mới còn

#### Scenario: Ảnh lọt lượt dọn theo chủ

- **WHEN** lượt đối chiếu thấy một ảnh trong kho mà chủ của nó đã bị xoá hẳn
- **THEN** ảnh đó bị xoá khỏi kho

#### Scenario: Tệp trong kho không ứng với ảnh nào

- **WHEN** lượt đối chiếu thấy trong kho một tệp không thuộc ảnh nào hệ thống biết, cũ hơn hạn một quyền tải
- **THEN** tệp đó bị xoá khỏi kho

#### Scenario: Ảnh của tài khoản đã xoá mềm

- **WHEN** lượt đối chiếu chạy lúc một tài khoản đã xoá mềm nhưng chưa bị xoá hẳn
- **THEN** ảnh đại diện của tài khoản đó vẫn còn trong kho

#### Scenario: Ảnh đang tải dở

- **WHEN** lượt đối chiếu chạy lúc một ảnh mới tải 2 giờ, còn mang nhãn "chưa xác nhận"
- **THEN** ảnh vẫn còn trong kho và vẫn đặt làm ảnh đại diện được

#### Scenario: Ảnh đang dùng mà mất khỏi kho

- **WHEN** lượt đối chiếu thấy ảnh đại diện đang dùng mà tệp không còn trong kho
- **THEN** chủ tài khoản nhận một thông báo nhóm "tài khoản" có nhắc, mời chọn ảnh khác, và hồ sơ không bị lượt đối
  chiếu sửa

#### Scenario: Ảnh của tin mất khỏi kho

- **WHEN** lượt đối chiếu thấy hai ảnh của cùng một tin đang hiển thị không còn trong kho
- **THEN** người đăng nhận đúng một dòng thông báo chưa đọc nhóm "tin đăng của bạn" có nhắc, nói tin đó có 2 ảnh không
  còn trong kho, và tin không bị lượt đối chiếu sửa

#### Scenario: Ảnh của tin đã xoá mất khỏi kho

- **WHEN** lượt đối chiếu thấy ảnh của một tin người đăng đã xoá không còn trong kho
- **THEN** người đăng không nhận thông báo nào về tin đó

#### Scenario: Lượt đối chiếu hết thời gian

- **WHEN** lượt đối chiếu chạm trần thời gian trước khi xét hết kho
- **THEN** lượt đó báo đã làm được một phần kèm số đã xét, và lượt sau xét tiếp phần còn lại
