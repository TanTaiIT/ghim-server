## Purpose

Dọn ảnh không còn ai dùng — ảnh tải dở, ảnh của chủ đã bị xoá hẳn, ảnh lọt lưới — để mọi ảnh trong kho hoặc
có chủ, hoặc đang nằm trong diện dọn (TK 25, cam kết 30).

## ADDED Requirements

### Requirement: Xoá ảnh chưa xác nhận quá 48 giờ

Ảnh còn mang nhãn "chưa xác nhận" quá 48 giờ (giá trị khởi đầu) kể từ lúc xin tải SHALL bị xoá khỏi kho. Lượt dọn
chạy mỗi 6 giờ, nên ảnh bị xoá chậm nhất 6 giờ sau mốc 48 giờ. Ảnh đã gỡ nhãn MUST NOT bị lượt dọn này xoá.

#### Scenario: Ảnh tải dở quá 48 giờ

- **WHEN** một ảnh được tải cho hồ sơ hơn 48 giờ trước và chưa từng được đặt làm ảnh đại diện
- **THEN** ảnh bị xoá khỏi kho chậm nhất ở lượt dọn kế tiếp, và đặt ảnh đó làm ảnh đại diện sau khi bị xoá nhận
  HTTP 400 `IMAGE_NOT_IN_STORAGE`

#### Scenario: Ảnh chưa tới 48 giờ

- **WHEN** lượt dọn chạy lúc một ảnh còn nhãn mới được tải 47 giờ
- **THEN** ảnh vẫn còn trong kho và vẫn đặt làm ảnh đại diện được

#### Scenario: Ảnh đã gỡ nhãn

- **WHEN** một ảnh được tải 50 giờ trước và đã được đặt làm ảnh đại diện trong vòng 48 giờ đầu
- **THEN** ảnh không bị lượt dọn xoá

### Requirement: Ảnh được dọn theo chủ

Khi một chủ — hồ sơ, nháp, tin — bị xoá hẳn, mọi ảnh thuộc về nó SHALL bị xoá khỏi kho, kể cả ảnh còn mang nhãn
"chưa xác nhận". Xoá mềm MUST NOT xoá ảnh. Khi nào chủ bị xoá hẳn do capability sở hữu chủ đó quyết định, không
thuộc capability này.

#### Scenario: Tài khoản bị xoá hẳn

- **WHEN** một tài khoản có ảnh đại diện và một ảnh vừa tải còn nhãn "chưa xác nhận" bị xoá hẳn
- **THEN** cả hai ảnh bị xoá khỏi kho chậm nhất ở lượt đối chiếu kế tiếp

#### Scenario: Tài khoản bị xoá mềm

- **WHEN** người dùng xoá tài khoản của mình và tài khoản đang trong thời gian chờ xoá hẳn
- **THEN** ảnh đại diện của tài khoản vẫn còn trong kho

### Requirement: Đối chiếu kho ảnh hằng tháng

Mỗi tháng hệ thống SHALL đối chiếu toàn bộ kho ảnh và xoá mọi ảnh không được chủ nào còn tồn tại dùng tới, trừ ảnh
còn mang nhãn "chưa xác nhận" chưa quá 48 giờ. Ảnh đang được dùng, kể cả bởi một chủ đã xoá mềm, MUST NOT bị xoá.
Ảnh đang được dùng mà không còn trong kho SHALL được ghi nhận cho chủ của nó xử lý; lượt đối chiếu MUST NOT tự sửa
chủ. Lượt đối chiếu bị cắt giữa chừng SHALL báo đã làm được một phần, và lượt sau làm tiếp.

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
- **THEN** hệ thống ghi nhận ảnh mất cho chủ của nó, và hồ sơ không bị lượt đối chiếu sửa

#### Scenario: Lượt đối chiếu hết thời gian

- **WHEN** lượt đối chiếu chạm trần thời gian trước khi xét hết kho
- **THEN** lượt đó báo đã làm được một phần kèm số đã xét, và lượt sau xét tiếp phần còn lại
