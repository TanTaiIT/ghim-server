## Purpose

Cho hai bên của một hội thoại — về một tin, hay với đội Hỗ trợ Ghim / quản trị một nhóm — gửi ảnh cho nhau, qua cùng luật
chất lượng của ảnh tin, chỉ hai bên và người xử báo cáo thấy, và ảnh đi theo hạn lưu của hội thoại.

## ADDED Requirements

### Requirement: Tin nhắn mang tối đa 4 ảnh

Mỗi bên của hội thoại SHALL gửi được một tin nhắn có tối đa 4 ảnh, kèm chữ hoặc không. Ảnh SHALL là ảnh chính người gửi đã
tải cho đúng hội thoại đó và chưa gửi trong tin nhắn nào; mọi luật gửi khác của hội thoại (chặn, bên kia đã rời, nhóm đóng)
áp như tin chữ. Hai bên SHALL thấy ảnh theo đúng thứ tự gửi.

#### Scenario: Gửi ảnh kèm chữ

- **WHEN** người mua gửi hai ảnh đã tải cho hội thoại kèm một câu
- **THEN** response có HTTP 201 và người bán thấy tin nhắn có câu đó cùng hai ảnh theo đúng thứ tự

#### Scenario: Gửi riêng ảnh

- **WHEN** người bán gửi một ảnh không kèm chữ
- **THEN** response có HTTP 201, tin nhắn có chữ rỗng và một ảnh, và thông báo cho người mua ghi "Đã gửi 1 ảnh"

#### Scenario: Năm ảnh

- **WHEN** một bên gửi năm ảnh trong một tin nhắn
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không tin nhắn nào được thêm

#### Scenario: Ảnh không phải của mình cho hội thoại này

- **WHEN** một bên gửi ảnh do bên kia tải, ảnh tải cho hội thoại khác, hay ảnh đã gửi trong một tin nhắn trước
- **THEN** response có HTTP 400 `IMAGE_NOT_IN_STORAGE` và không tin nhắn nào được thêm

### Requirement: Ai tải được ảnh cho một hội thoại

Người đang ở trong hội thoại qua app — người dùng, bên kia của hội thoại về tin, người đang giữ vai quản trị của nhóm —
SHALL xin được quyền tải ảnh cho hội thoại đó. Người ngoài hội thoại và staff hỗ trợ trên bàn vận hành MUST NOT xin được;
staff trả lời hội thoại hỗ trợ chỉ bằng chữ.

#### Scenario: Người trong hội thoại xin tải

- **WHEN** người mua xin tải một ảnh cho hội thoại của mình
- **THEN** response có HTTP 201 kèm quyền tải và cạnh ngắn tối thiểu của ảnh tin

#### Scenario: Người ngoài hội thoại

- **WHEN** một tài khoản không ở trong hội thoại xin tải ảnh cho hội thoại đó
- **THEN** response có HTTP 404 `NOT_FOUND`, giống hệt khi hội thoại không tồn tại

#### Scenario: Staff hỗ trợ trả lời kèm ảnh

- **WHEN** staff hỗ trợ trả lời trên bàn vận hành kèm mã ảnh
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

### Requirement: Ảnh tin nhắn qua luật chất lượng của ảnh tin

Ảnh tin nhắn SHALL được đo ngay trong lượt gửi theo đúng các luật chất lượng ảnh đang bật của máy duyệt và ngưỡng của bảng
con số (`screening/image-checks`). Tin nhắn không chờ người duyệt: ảnh trúng một luật thì tin nhắn MUST NOT được gửi, và câu
trả về SHALL là câu sửa của tin đăng nêu ảnh thứ mấy. Ảnh không mở được SHALL luôn bị chặn. Ảnh tin nhắn MUST NOT bị so
trùng với ảnh khác và MUST NOT bị xét nội dung.

#### Scenario: Ảnh hỏng

- **WHEN** một bên gửi hai ảnh mà ảnh thứ hai không giải mã được
- **THEN** response có HTTP 400 `MESSAGE_IMAGE_REJECTED` với câu "Ảnh 2 không mở được. Xoá ảnh đó rồi tải ảnh khác." và
  không tin nhắn nào được thêm

#### Scenario: Ảnh nhỏ khi luật đang chạy thử

- **WHEN** luật "Ảnh quá nhỏ" đang chạy thử và một bên gửi ảnh có cạnh ngắn dưới ngưỡng
- **THEN** tin nhắn được gửi

#### Scenario: Ảnh nhỏ khi luật đang bật

- **WHEN** luật "Ảnh quá nhỏ" đang bật và một bên gửi ảnh có cạnh ngắn dưới ngưỡng
- **THEN** response có HTTP 400 `MESSAGE_IMAGE_REJECTED` với câu "Ảnh 1 quá nhỏ. Thay bằng ảnh chụp rõ hơn."

### Requirement: Ai thấy ảnh tin nhắn

Ảnh tin nhắn SHALL chỉ đến tay người đọc được hội thoại: hai bên, cả đội của hội thoại với một đội (hàng hỗ trợ trên bàn
vận hành, mọi người đang quản trị nhóm), và người xử khi hội thoại đi kèm một lượt báo cáo — bản ghi hội thoại cho người
xử SHALL có ảnh của từng tin nhắn.

#### Scenario: Quản trị nhóm gửi ảnh

- **WHEN** chủ nhóm gửi ảnh trong hội thoại với một người dùng
- **THEN** người dùng thấy ảnh dưới tên nhóm, không thấy ai trong đội gửi

#### Scenario: Staff hỗ trợ đọc ảnh

- **WHEN** người dùng gửi ảnh cho Hỗ trợ Ghim
- **THEN** staff hỗ trợ thấy ảnh đó khi mở hội thoại trên bàn vận hành

#### Scenario: Hội thoại bị báo

- **WHEN** người mua báo cáo người bán từ hội thoại có ảnh người bán đã gửi
- **THEN** người xử mở việc thấy ảnh đó trong bản ghi hội thoại

### Requirement: Ảnh theo hạn lưu của hội thoại

Ảnh tin nhắn thuộc về hội thoại. Khi hội thoại bị xoá hẳn — theo hạn lưu, hay cùng nhóm đóng quá hạn — mọi ảnh của nó SHALL
bị xoá khỏi kho cùng lượt; hội thoại đang giữ làm bằng chứng thì ảnh của nó còn.

#### Scenario: Hội thoại quá hạn lưu

- **WHEN** một hội thoại có ảnh bị xoá hẳn theo hạn lưu
- **THEN** dòng ảnh và tệp trong kho bị xoá, đường xem cũ không còn mở được
