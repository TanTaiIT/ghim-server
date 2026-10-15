# platform/config-versions Specification

## Purpose

Giữ mọi con số vận hành của Ghim trong một bảng có phiên bản, để master chỉnh dần theo kết quả hậu kiểm mà
không phát hành lại phần mềm, và mọi kết quả tra lại được đúng bộ con số nó đã dùng (TK 28, TK 30, cam kết
33).

## Requirements

### Requirement: Phiên bản đầu mang giá trị khởi đầu

Hệ thống SHALL chạy với một bảng con số có phiên bản. Phiên bản đầu tiên MUST mang đúng các giá trị khởi đầu
ở TK 28, và mọi con số ở TK 28 SHALL được đọc từ bảng này.

#### Scenario: Hệ thống vừa dựng

- **WHEN** master xem bảng con số của một hệ thống vừa dựng
- **THEN** phiên bản hiện hành là phiên bản 1, trong đó tin sống tối đa của T0 là 10 và đơn xin vào nhóm tự
  huỷ sau 21 ngày (giá trị khởi đầu)

### Requirement: Đổi con số tạo phiên bản mới

Mỗi lần master đổi một hay nhiều con số SHALL tạo một phiên bản mới với số kế tiếp, người đổi và thời điểm.
Phiên bản mới MUST có hiệu lực ngay cho mọi lượt tính sau đó, không cần phát hành lại hay khởi động lại phần
mềm.

#### Scenario: Đổi nhịp gửi của T0

- **WHEN** master đổi lượt gửi mỗi giờ của T0 từ 3 thành 4 trong lúc phiên bản hiện hành là 1
- **THEN** phiên bản 2 được tạo, ghi tên master và thời điểm, và bảng hiện hành trả 4 mà không cần khởi động
  lại

#### Scenario: Đổi nhiều con số một lần

- **WHEN** master đổi cùng lúc hạn đơn xin vào nhóm và hạn lời mời
- **THEN** chỉ một phiên bản mới được tạo, chứa cả hai thay đổi

### Requirement: Phiên bản cũ không đổi và tra lại được

Phiên bản đã có MUST NOT bị sửa hay xoá. Mọi phiên bản SHALL tra lại được theo số, để một kết quả ghi số phiên
bản biết đúng bộ con số nó đã dùng.

#### Scenario: Tra phiên bản cũ

- **WHEN** phiên bản hiện hành là 2 và master tra phiên bản 1
- **THEN** phiên bản 1 vẫn có lượt gửi mỗi giờ của T0 là 3

#### Scenario: Phần mềm thêm một con số mới

- **WHEN** phiên bản hiện hành là 3 và bản phần mềm mới có thêm một con số chưa có trong bảng
- **THEN** lúc khởi động hệ thống tạo phiên bản 4 mang con số đó với giá trị khởi đầu, ghi người tạo là hệ
  thống, và phiên bản 3 vẫn không có con số đó

#### Scenario: Phiên bản không tồn tại

- **WHEN** master tra một số phiên bản chưa từng có
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Chỉ master đổi bảng con số

Chỉ master SHALL tạo phiên bản mới của bảng con số. Staff và người dùng MUST NOT đổi được con số nào.

#### Scenario: Staff thử đổi con số

- **WHEN** một staff gửi thay đổi bảng con số
- **THEN** response có HTTP 403 `FORBIDDEN` và phiên bản hiện hành không đổi

### Requirement: Con số mới phải hợp lệ

Mỗi con số trong thay đổi MUST là con số đã có trong bảng, đúng kiểu, và nằm trong khoảng hợp lệ của nó. Mặc định:

- số nguyên từ 1;
- tỉ lệ phần trăm 0–100;
- thời lượng tối đa 100 năm.

Một số con số nhận 0 vì 0 có nghĩa ("tắt", "không chờ"). Một số có trần riêng do chỗ dùng nó.

Có một con số sai thì SHALL không phiên bản nào được tạo, và câu lỗi nêu con số sai cùng khoảng hợp lệ của nó (chốt
15/10/2026).

#### Scenario: Số âm

- **WHEN** master đặt số tin sống tối đa của T1 là -5
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và phiên bản hiện hành không đổi

#### Scenario: Tỉ lệ vượt 100

- **WHEN** master đặt tỉ lệ lấy mẫu hậu kiểm tin của T0, T1 là 120%
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Con số không có trong bảng

- **WHEN** master gửi thay đổi kèm một tên con số không có trong bảng
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không con số nào trong thay đổi đó được áp

#### Scenario: Số 0 làm hỏng hệ thống

- **WHEN** master đặt số ngày phiên đăng nhập rảnh tối đa là 0
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và phiên bản hiện hành không đổi

#### Scenario: Số 0 có nghĩa

- **WHEN** master đặt số ngày chờ xin vào lại nhóm là 0
- **THEN** một phiên bản mới được tạo với giá trị 0

#### Scenario: Vượt trần riêng

- **WHEN** master đặt độ lệch tối đa để coi hai ảnh là trùng là 5
- **THEN** response có HTTP 400 `VALIDATION_ERROR`, câu lỗi nêu khoảng 0–4, và phiên bản hiện hành không đổi

#### Scenario: Thời lượng quá 100 năm

- **WHEN** master đặt số ngày hiển thị một tin là 40000
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và phiên bản hiện hành không đổi

### Requirement: Các con số giữ ràng buộc giữa nhau

Cả bảng sau khi áp thay đổi MUST giữ các ràng buộc thứ tự giữa các con số mà hệ thống dựa vào. Ví dụ: ngưỡng dải
Vừa thấp hơn dải Cao, độ dài mật khẩu tối thiểu không quá tối đa, ngày nhắc hết hạn ngắn hơn số ngày hiển thị. Vi
phạm một ràng buộc, kể cả khi lệch là do một con số không nằm trong thay đổi, thì SHALL không phiên bản nào được tạo
(chốt 15/10/2026).

#### Scenario: Thay đổi làm lệch con số chưa đổi

- **WHEN** số ngày hiển thị một tin là 30 (giá trị khởi đầu) và master chỉ đặt số ngày nhắc trước khi hết hạn là 30
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và phiên bản hiện hành không đổi

#### Scenario: Ngưỡng dải đảo chiều

- **WHEN** master đặt cùng lúc ngưỡng dải Vừa là 70 và ngưỡng dải Cao là 60
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không con số nào trong thay đổi đó được áp

### Requirement: Không ghi đè thay đổi từ phiên khác

Mỗi thay đổi SHALL nêu phiên bản mà nó sửa từ đó. Phiên bản ấy không còn là phiên bản hiện hành thì thay đổi
MUST bị từ chối, để master mở bàn vận hành trên hai thiết bị không ghi đè chính mình mà không biết.

#### Scenario: Hai phiên cùng sửa

- **WHEN** master sửa từ phiên bản 2 trên hai thiết bị và thay đổi từ thiết bị thứ nhất tạo phiên bản 3
- **THEN** thay đổi từ thiết bị thứ hai nhận HTTP 409 `CONFLICT` và bảng vẫn ở phiên bản 3

#### Scenario: Ghi chú đi kèm

- **WHEN** master đổi một con số kèm ghi chú "theo kết quả hậu kiểm tháng 10"
- **THEN** phiên bản mới lưu ghi chú đó và tra lại được cùng phiên bản
