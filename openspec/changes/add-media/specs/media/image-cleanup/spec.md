## Purpose

Dọn ảnh không còn ai dùng — ảnh tải dở, ảnh của chủ đã bị xoá hẳn, ảnh lọt lưới — để mọi ảnh trong kho hoặc
có chủ, hoặc đang nằm trong diện dọn (TK 25, cam kết 30).

## ADDED Requirements

### Requirement: Xoá ảnh chưa xác nhận quá 48 giờ

Ảnh còn mang nhãn "chưa xác nhận" quá 48 giờ kể từ lúc tải SHALL bị xoá khỏi kho. Lượt dọn chạy mỗi 6 giờ,
nên ảnh bị xoá chậm nhất 6 giờ sau mốc 48 giờ. Ảnh đã gỡ nhãn MUST NOT bị lượt dọn này xoá.

#### Scenario: Ảnh tải dở quá 48 giờ

- **WHEN** một ảnh được tải cho nháp hơn 48 giờ trước và nháp chưa từng được lưu cùng ảnh đó
- **THEN** ảnh bị xoá khỏi kho chậm nhất ở lượt dọn kế tiếp, và lưu nháp với ảnh đó sau khi bị xoá nhận
  HTTP 400 `IMAGE_NOT_IN_STORAGE`

#### Scenario: Ảnh chưa tới 48 giờ

- **WHEN** lượt dọn chạy lúc một ảnh còn nhãn mới được tải 47 giờ
- **THEN** ảnh vẫn còn trong kho và vẫn lưu vào nháp được

#### Scenario: Ảnh đã gỡ nhãn

- **WHEN** một ảnh được tải 50 giờ trước và nháp đã được lưu cùng ảnh đó trong vòng 48 giờ đầu
- **THEN** ảnh không bị lượt dọn xoá

### Requirement: Ảnh được dọn theo chủ

Khi một nháp, một tin hay một hồ sơ bị xoá hẳn, mọi ảnh thuộc về nó SHALL bị xoá khỏi kho, kể cả ảnh còn mang
nhãn "chưa xác nhận". Xoá mềm MUST NOT xoá ảnh. Khi nào chủ bị xoá hẳn do capability sở hữu chủ đó quyết
định, không thuộc capability này.

#### Scenario: Nháp bị xoá hẳn

- **WHEN** một nháp có ba ảnh đã lưu và một ảnh vừa tải còn nhãn "chưa xác nhận" bị xoá hẳn
- **THEN** cả bốn ảnh bị xoá khỏi kho

#### Scenario: Tin bị xoá mềm

- **WHEN** người đăng xoá mềm một tin của mình
- **THEN** ảnh của tin vẫn còn trong kho cho tới khi tin bị xoá hẳn

### Requirement: Đối chiếu kho ảnh hằng tháng

Mỗi tháng hệ thống SHALL đối chiếu toàn bộ kho ảnh và xoá mọi ảnh không được nháp, tin hay hồ sơ nào còn tồn
tại dùng tới, trừ ảnh còn mang nhãn "chưa xác nhận" chưa quá 48 giờ. Ảnh đang được dùng, kể cả bởi một tin đã
xoá mềm, MUST NOT bị xoá.

#### Scenario: Ảnh bị bỏ khỏi nháp

- **WHEN** người dùng bỏ một ảnh khỏi nháp và lưu lại, rồi lượt đối chiếu hằng tháng chạy
- **THEN** ảnh đó bị xoá khỏi kho

#### Scenario: Ảnh lọt lượt dọn theo chủ

- **WHEN** lượt đối chiếu thấy một ảnh trong kho mà chủ của nó đã bị xoá hẳn
- **THEN** ảnh đó bị xoá khỏi kho

#### Scenario: Ảnh của tin đã xoá mềm

- **WHEN** lượt đối chiếu chạy lúc một tin đã bị người đăng xoá mềm nhưng chưa bị xoá hẳn
- **THEN** ảnh của tin đó vẫn còn trong kho

#### Scenario: Ảnh đang tải dở

- **WHEN** lượt đối chiếu chạy lúc một ảnh mới tải 2 giờ, còn mang nhãn "chưa xác nhận"
- **THEN** ảnh vẫn còn trong kho và vẫn lưu vào nháp được
