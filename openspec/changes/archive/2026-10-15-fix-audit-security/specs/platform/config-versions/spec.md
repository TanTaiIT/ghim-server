## MODIFIED Requirements

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

## ADDED Requirements

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
