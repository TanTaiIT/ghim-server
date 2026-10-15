## ADDED Requirements

### Requirement: Lượt ghi của người đăng không đè thay đổi của hệ thống

Lượt sửa, gửi lại, gia hạn hay lưu nháp của người đăng SHALL giữ nơi đăng và huy hiệu mà hệ thống vừa đổi (riêng tư
hoá hạ "nhóm công khai" về "chỉ thành viên", gỡ huy hiệu) khi người đăng không đổi chúng; chỉ ô người đăng đổi mới thay
giá trị đang có (chốt 15/10/2026).

#### Scenario: Nhóm riêng tư hoá trong lúc sửa tiêu đề

- **WHEN** người đăng mở tin "nhóm công khai" của mình, nhóm sang riêng tư và tin bị hạ về "chỉ thành viên", rồi người
  đăng gửi sửa tiêu đề từ màn hình đã mở
- **THEN** tin mang tiêu đề mới và vẫn là "chỉ thành viên"

#### Scenario: Huy hiệu bị gỡ trong lúc bật giao tận nơi

- **WHEN** người đăng mở tin mang huy hiệu nhóm, huy hiệu bị gỡ, rồi người đăng bật "giao tận nơi" từ màn hình đã mở
- **THEN** tin bật "giao tận nơi" và không mang huy hiệu
