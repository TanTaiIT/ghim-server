# group/group-modes Specification

## Purpose

Định nghĩa bốn chế độ của nhóm — ai tìm thấy nhóm, vào bằng cách nào — cùng các cài đặt đi theo chế độ, và
cách đổi chế độ mà không để lộ nhóm riêng tư dù trong chốc lát (TK 9).

## Requirements

### Requirement: Bốn chế độ

Nhóm SHALL ở đúng một trong bốn chế độ: công khai · mở cửa, công khai · xét duyệt, riêng tư · có mã, riêng tư
· chỉ lời mời. Chế độ "riêng tư · mở cửa" MUST NOT tồn tại.

#### Scenario: Đặt nhóm riêng tư mở cửa

- **WHEN** master lập hoặc chủ nhóm đổi một nhóm sang riêng tư kèm cách vào "bấm tham gia là vào"
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và chế độ của nhóm không đổi

### Requirement: Ai tìm thấy nhóm

Nhóm công khai SHALL hiện trong tìm kiếm nhóm và mọi người, kể cả khách, xem được hồ sơ của nó. Nhóm riêng tư
MUST NOT hiện trong tìm kiếm; nhóm riêng tư · có mã chỉ được tìm thấy bằng cách nhập đúng mã nhóm.

#### Scenario: Khách tìm nhóm

- **WHEN** khách tìm nhóm theo một tên mà cả một nhóm công khai lẫn một nhóm riêng tư đều mang
- **THEN** kết quả có nhóm công khai và không có nhóm riêng tư

#### Scenario: Khách xem hồ sơ nhóm công khai

- **WHEN** khách mở hồ sơ một nhóm công khai
- **THEN** response có HTTP 200 với hồ sơ nhóm

#### Scenario: Nhóm riêng tư chỉ lời mời

- **WHEN** khách tìm nhóm theo đúng tên của một nhóm riêng tư · chỉ lời mời
- **THEN** kết quả không có nhóm đó

### Requirement: Chủ nhóm hoặc master đổi chế độ

Chế độ của nhóm SHALL chỉ do chủ nhóm hoặc master đổi. Đổi cách vào trong cùng một phía — công khai với công
khai, riêng tư với riêng tư — MUST có hiệu lực ngay.

#### Scenario: Đổi cách vào của nhóm công khai

- **WHEN** chủ nhóm đổi nhóm công khai · mở cửa sang công khai · xét duyệt
- **THEN** nhóm ở chế độ công khai · xét duyệt ngay, và người muốn vào từ đó phải gửi đơn

#### Scenario: Xét duyệt sang mở cửa

- **WHEN** chủ nhóm đổi nhóm công khai · xét duyệt đang có đơn chờ sang công khai · mở cửa
- **THEN** mọi đơn đang chờ bị huỷ, và người xin bấm tham gia thì vào ngay với đường vào "bấm tham gia"

#### Scenario: Có mã sang chỉ lời mời

- **WHEN** chủ nhóm đổi nhóm riêng tư · có mã đang có đơn chờ sang riêng tư · chỉ lời mời
- **THEN** nhập mã cũ nhận HTTP 404 `NOT_FOUND`, còn đơn đang chờ vẫn duyệt được

#### Scenario: Chỉ lời mời sang có mã

- **WHEN** chủ nhóm đổi nhóm riêng tư · chỉ lời mời sang riêng tư · có mã
- **THEN** nhóm có một mã nhóm mới

#### Scenario: Điều hành viên thử đổi chế độ

- **WHEN** một điều hành viên đổi chế độ của nhóm
- **THEN** response có HTTP 403 `FORBIDDEN` và chế độ không đổi

### Requirement: Công khai sang riêng tư qua trạng thái chuyển

Đổi nhóm công khai sang riêng tư SHALL đưa nhóm vào "đang chuyển sang riêng tư" trước. Nhóm MUST chỉ thành
riêng tư khi mọi tin mức "nhóm công khai" của nhóm đã hạ xong, và khi đó "nhận tin người ngoài" đã tắt.

#### Scenario: Bắt đầu chuyển

- **WHEN** chủ nhóm đổi một nhóm công khai còn tin mức "nhóm công khai" sang riêng tư · có mã
- **THEN** nhóm ở trạng thái đang chuyển sang riêng tư, chưa thành riêng tư

#### Scenario: Chuyển xong

- **WHEN** mọi tin mức "nhóm công khai" của nhóm đang chuyển đã hạ xong
- **THEN** nhóm trở lại đang hoạt động ở chế độ riêng tư · có mã, "nhận tin người ngoài" đang tắt và "hiện tên
  nhóm trên tin sàn" đang tắt

#### Scenario: Nhóm không có tin công khai

- **WHEN** chủ nhóm đổi sang riêng tư một nhóm công khai không có tin mức "nhóm công khai" nào
- **THEN** nhóm thành riêng tư ngay

#### Scenario: Đổi tiếp khi đang chuyển

- **WHEN** chủ nhóm đổi chế độ lần nữa trong lúc nhóm đang chuyển sang riêng tư
- **THEN** response có HTTP 409 `GROUP_STATE_CONFLICT`

### Requirement: Riêng tư sang công khai không hạ gì

Chủ nhóm hoặc master SHALL đổi được nhóm riêng tư sang công khai mà không qua trạng thái chuyển. Đổi chế độ
MUST NOT làm đổi tư cách hay đường vào của thành viên hiện có.

#### Scenario: Nhóm riêng tư thành công khai

- **WHEN** việc đổi một nhóm riêng tư · chỉ lời mời sang công khai · xét duyệt có hiệu lực
- **THEN** nhóm hiện trong tìm kiếm, và mọi thành viên vẫn là thành viên với đường vào như cũ

### Requirement: Nhận tin người ngoài chỉ ở nhóm công khai

Chủ nhóm hoặc master SHALL bật tắt được "nhận tin người ngoài" của nhóm. Cài đặt này MUST chỉ bật được ở nhóm
công khai.

#### Scenario: Bật ở nhóm công khai

- **WHEN** chủ của một nhóm công khai bật nhận tin người ngoài
- **THEN** cài đặt của nhóm ghi nhận tin người ngoài đang bật

#### Scenario: Bật ở nhóm riêng tư

- **WHEN** chủ của một nhóm riêng tư bật nhận tin người ngoài
- **THEN** response có HTTP 409 `GROUP_MODE_CONFLICT` và cài đặt vẫn tắt

#### Scenario: Điều hành viên thử bật

- **WHEN** một điều hành viên bật nhận tin người ngoài
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Kiểu bảng tin

Chủ nhóm hoặc master SHALL chọn kiểu bảng tin của nhóm: dạng dòng hoặc dạng lưới. Hồ sơ nhóm MUST trả đúng
kiểu đã chọn.

#### Scenario: Chọn dạng lưới

- **WHEN** chủ nhóm chọn kiểu bảng tin dạng lưới
- **THEN** hồ sơ nhóm trả kiểu bảng tin dạng lưới

#### Scenario: Kiểu không có

- **WHEN** chủ nhóm chọn một kiểu bảng tin khác dạng dòng và dạng lưới
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Điều hành viên thử đổi kiểu

- **WHEN** một điều hành viên đổi kiểu bảng tin
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Mô tả nhóm

Chủ nhóm hoặc master SHALL sửa được mô tả của nhóm, tối đa 1000 ký tự. Hồ sơ nhóm MUST trả đúng mô tả đã lưu.

#### Scenario: Sửa mô tả

- **WHEN** chủ nhóm sửa mô tả nhóm
- **THEN** hồ sơ nhóm trả mô tả mới

#### Scenario: Điều hành viên thử sửa mô tả

- **WHEN** một điều hành viên sửa mô tả nhóm
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Bật hiện tên nhóm khi đổi sang riêng tư

Công tắc "hiện tên nhóm trên tin sàn" SHALL xét theo chế độ nhóm đang có: lượt đổi sang riêng tư phải qua trạng thái
chuyển thì nhóm vẫn công khai tới khi chuyển xong, nên lượt đó MUST NOT bật được công tắc.

#### Scenario: Bật cùng lượt đổi còn tin công khai

- **WHEN** chủ nhóm đổi một nhóm công khai còn tin mức "nhóm công khai" sang riêng tư · có mã và bật "hiện tên nhóm
  trên tin sàn" trong cùng lượt
- **THEN** response có HTTP 409 `GROUP_MODE_CONFLICT` và nhóm vẫn đang hoạt động ở chế độ cũ
