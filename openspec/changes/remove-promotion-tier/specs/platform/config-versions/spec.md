## MODIFIED Requirements

### Requirement: Phiên bản cũ không đổi và tra lại được

Phiên bản đã có MUST NOT bị sửa hay xoá. Mọi phiên bản SHALL tra lại được theo số, để một kết quả ghi số phiên
bản biết đúng bộ con số nó đã dùng. Phiên bản mới SHALL mang đúng các con số của bản phần mềm đang chạy: con số mới
được thêm với giá trị khởi đầu, con số phần mềm đã gỡ MUST NOT được mang sang (chốt 03/11/2026).

#### Scenario: Tra phiên bản cũ

- **WHEN** phiên bản hiện hành là 2 và master tra phiên bản 1
- **THEN** phiên bản 1 vẫn có lượt gửi mỗi giờ của T0 là 3

#### Scenario: Phần mềm thêm một con số mới

- **WHEN** phiên bản hiện hành là 3 và bản phần mềm mới có thêm một con số chưa có trong bảng
- **THEN** lúc khởi động hệ thống tạo phiên bản 4 mang con số đó với giá trị khởi đầu, ghi người tạo là hệ
  thống, và phiên bản 3 vẫn không có con số đó

#### Scenario: Phần mềm gỡ một con số

- **WHEN** phiên bản hiện hành là 3 và còn mang mức tối thiểu của gói đẩy tin mà bản phần mềm mới đã gỡ
- **THEN** lúc khởi động hệ thống tạo phiên bản 4 không có con số đó, ghi người tạo là hệ thống, và phiên bản 3
  vẫn mang con số đó

#### Scenario: Master đổi con số khi bảng còn con số đã gỡ

- **WHEN** phiên bản hiện hành còn mang một con số phần mềm đã gỡ và master đổi một con số khác
- **THEN** phiên bản mới không có con số đã gỡ

#### Scenario: Phiên bản không tồn tại

- **WHEN** master tra một số phiên bản chưa từng có
- **THEN** response có HTTP 404 `NOT_FOUND`
