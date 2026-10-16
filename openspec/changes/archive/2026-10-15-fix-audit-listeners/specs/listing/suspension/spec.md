## ADDED Requirements

### Requirement: Tạm ẩn theo trạng thái hiện tại, không theo thứ tự xử

Lý do tạm ẩn của tài khoản bị khoá, nhóm bị tạm khoá, bị cấm khỏi nhóm, đã rời nhóm và danh mục bị tắt SHALL khớp
với trạng thái hiện tại của tài khoản, nhóm, lệnh cấm, tư cách thành viên và danh mục — bất kể các thay đổi được
hệ thống xử theo thứ tự nào, hay một thay đổi cũ được xử lại sau thay đổi mới (chốt 15/10/2026).

#### Scenario: Khoá nhóm được xử lại sau khi mở khoá

- **WHEN** master khoá rồi mở khoá nhóm, và hệ thống xử lại lượt khoá sau lượt mở khoá
- **THEN** tin của nhóm vẫn hiện, không mang lý do "nhóm bị tạm khoá"

#### Scenario: Rời nhóm được xử lại sau khi vào lại

- **WHEN** thành viên rời rồi vào lại nhóm, và hệ thống xử lại lượt rời sau lượt vào lại
- **THEN** tin "chỉ thành viên" của người đó vẫn hiện

#### Scenario: Mở khoá tài khoản được xử lại sau khi khoá lần nữa

- **WHEN** master khoá, mở khoá rồi khoá lại một tài khoản, và hệ thống xử lại lượt mở khoá sau cùng
- **THEN** tin của người đó vẫn tạm ẩn với lý do "tài khoản bị khoá"
