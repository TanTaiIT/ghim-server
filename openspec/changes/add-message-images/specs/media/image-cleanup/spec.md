## MODIFIED Requirements

### Requirement: Ảnh được dọn theo chủ

Khi một chủ — hồ sơ, nháp, tin, hội thoại — bị xoá hẳn, mọi ảnh thuộc về nó SHALL bị xoá khỏi kho, kể cả ảnh còn mang nhãn
"chưa xác nhận". Xoá mềm MUST NOT xoá ảnh. Khi nào chủ bị xoá hẳn do capability sở hữu chủ đó quyết định, không
thuộc capability này.

#### Scenario: Tài khoản bị xoá hẳn

- **WHEN** một tài khoản có ảnh đại diện và một ảnh vừa tải còn nhãn "chưa xác nhận" bị xoá hẳn
- **THEN** cả hai ảnh bị xoá khỏi kho chậm nhất ở lượt đối chiếu kế tiếp

#### Scenario: Tài khoản bị xoá mềm

- **WHEN** người dùng xoá tài khoản của mình và tài khoản đang trong thời gian chờ xoá hẳn
- **THEN** ảnh đại diện của tài khoản vẫn còn trong kho

#### Scenario: Hội thoại bị xoá thẳng khỏi DB

- **WHEN** một hội thoại có ảnh đã mất khỏi DB mà ảnh của nó còn trong kho
- **THEN** lượt đối chiếu kế tiếp xoá các ảnh đó
