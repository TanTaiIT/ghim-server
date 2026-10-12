## Purpose

Cho người đăng sửa tin đã gửi mà không lách được máy duyệt hay việc đang chờ: sửa gì người mua đọc hay lọc theo
thì qua máy lại, sửa gì làm tin ít người thấy hơn thì không (TK 19).

## ADDED Requirements

### Requirement: Sửa nội dung người mua đọc hay lọc theo thì qua máy lại

Đổi tiêu đề, mô tả, giá, danh mục, ảnh (kể cả đổi thứ tự), thông tin theo mẫu, tỉnh, phường hay nhóm đích SHALL
đưa tin qua máy lại: tin chuyển sang đang kiểm theo mũi tên "sửa" của vòng đời.

#### Scenario: Sửa tiêu đề tin đang hiển thị

- **WHEN** người đăng sửa tiêu đề một tin đang hiển thị
- **THEN** tin chuyển sang đang kiểm và người lạ không thấy tin tới khi máy cho qua

#### Scenario: Chỉ đổi thứ tự ảnh

- **WHEN** người đăng chỉ đổi thứ tự ảnh, làm ảnh bìa đổi
- **THEN** tin chuyển sang đang kiểm

#### Scenario: Sửa giá tin chờ duyệt

- **WHEN** người đăng sửa giá một tin đang chờ duyệt
- **THEN** tin chuyển sang đang kiểm

### Requirement: Mở rộng nơi đăng và gắn huy hiệu thì qua máy lại

Mở rộng nơi đăng, một hay hai nấc (chỉ thành viên → nhóm công khai → sàn chung), và gắn huy hiệu nhóm SHALL đưa
tin qua máy lại. Nơi đăng mới MUST thoả mọi luật nơi đăng như lúc gửi tin.

#### Scenario: Mở rộng hai nấc

- **WHEN** người đăng mở rộng một tin "chỉ thành viên" có tỉnh và phường lên sàn chung
- **THEN** tin chuyển sang đang kiểm với nơi đăng sàn chung

#### Scenario: Mở rộng lên sàn chung khi thiếu khu vực

- **WHEN** người đăng mở rộng một tin trong nhóm chưa có phường lên sàn chung
- **THEN** response có HTTP 400 `REGION_REQUIRED` và tin không đổi

#### Scenario: Gắn huy hiệu

- **WHEN** người đăng đủ điều kiện gắn huy hiệu nhóm lên tin sàn chung đang hiển thị của mình
- **THEN** tin chuyển sang đang kiểm

### Requirement: Sửa làm tin ít người thấy hơn thì không qua máy

Thu hẹp nơi đăng về một nhóm mình là thành viên, bỏ huy hiệu, và đổi "có thương lượng", "giao tận nơi", hiện số
điện thoại SHALL áp dụng ngay, không qua máy và không đổi trạng thái tin.

#### Scenario: Thu hẹp từ sàn chung về nhóm của mình

- **WHEN** người đăng đổi một tin sàn chung đang hiển thị về "chỉ thành viên" của một nhóm mình là thành viên
- **THEN** nơi đăng đổi ngay và tin vẫn đang hiển thị, không qua máy

#### Scenario: Bật giao tận nơi

- **WHEN** người đăng bật "giao tận nơi" cho một tin đang hiển thị
- **THEN** thay đổi áp dụng ngay và tin vẫn đang hiển thị, không qua máy

#### Scenario: Bỏ huy hiệu

- **WHEN** người đăng bỏ huy hiệu nhóm khỏi tin sàn chung của mình
- **THEN** huy hiệu biến khỏi tin ngay và tin vẫn đang hiển thị, không qua máy

### Requirement: So giá trị, không so ô được gửi lên

Hệ thống SHALL quyết có qua máy lại hay không bằng cách so giá trị trước và sau khi sửa, MUST NOT dựa vào việc app
có gửi một ô lên hay không.

#### Scenario: App gửi lại cả nội dung không đổi

- **WHEN** app gửi lại tiêu đề, mô tả và giá y hệt giá trị đang có, kèm bật "có thương lượng"
- **THEN** tin vẫn đang hiển thị, không qua máy

#### Scenario: App chỉ gửi ô đã đổi

- **WHEN** app chỉ gửi ô mô tả với nội dung mới
- **THEN** tin chuyển sang đang kiểm

### Requirement: Không đổi nơi đăng khi đang có việc chờ

Nơi đăng — mở rộng, thu hẹp hay đổi nhóm — MUST NOT đổi khi tin đang chờ duyệt, đang bị báo cáo hay đang hậu
kiểm, để không ai chuyển tin đi chỗ khác cho thoát việc đang chờ (TK 27 cam kết 19). Các phần sửa khác vẫn làm
được.

#### Scenario: Thu hẹp tin đang chờ duyệt

- **WHEN** người đăng thu hẹp nơi đăng của một tin đang chờ duyệt
- **THEN** response có HTTP 409 `PLACEMENT_LOCKED` và nơi đăng không đổi

#### Scenario: Mở rộng tin đang bị báo cáo

- **WHEN** người đăng mở rộng nơi đăng của một tin đang hiển thị có báo cáo chưa xử
- **THEN** response có HTTP 409 `PLACEMENT_LOCKED` và nơi đăng không đổi

#### Scenario: Sửa giá tin đang chờ duyệt

- **WHEN** người đăng sửa giá, không đổi nơi đăng, của một tin đang chờ duyệt
- **THEN** sửa được nhận và tin chuyển sang đang kiểm

### Requirement: Chuyển tin vào nhóm mình không phải thành viên

Đổi nơi đăng vào một nhóm mà người đăng không phải thành viên SHALL được xét như gửi tin mới theo luật người
ngoài: tin qua máy lại, và nhóm phải nhận tin người ngoài.

#### Scenario: Nhóm nhận tin người ngoài

- **WHEN** người đăng chuyển một tin sàn chung vào mức "nhóm công khai" của một nhóm công khai mình không phải
  thành viên, nhóm đang bật nhận tin người ngoài
- **THEN** tin chuyển sang đang kiểm với nơi đăng mới

#### Scenario: Nhóm không nhận tin người ngoài

- **WHEN** người đăng chuyển một tin vào một nhóm mình không phải thành viên, nhóm đang tắt nhận tin người ngoài
- **THEN** response có HTTP 403 `OUTSIDER_POSTS_DISABLED` và tin không đổi

### Requirement: Tin đã rời nhóm hẳn không sửa được

Tin đã rời nhóm hẳn — nhóm đã đóng, tin người ngoài rời nhóm vì nhóm sang riêng tư, tin bị gỡ khỏi nhóm — MUST NOT
sửa được nữa. Người đăng chỉ chuyển được tin đó lên sàn chung thành một tin mới (listing/suspension) hoặc xoá nó,
để mỗi món đồ chỉ lên sàn chung một lần (chốt 12/10/2026).

#### Scenario: Sửa nơi đăng tin của nhóm đã đóng

- **WHEN** người đăng đổi nơi đăng một tin của nhóm đã đóng lên sàn chung, có đủ tỉnh và phường
- **THEN** response có HTTP 409 `LISTING_DETACHED` và tin không đổi

#### Scenario: Xoá tin đã rời nhóm

- **WHEN** người đăng xoá một tin bị gỡ khỏi nhóm
- **THEN** tin bị xoá
