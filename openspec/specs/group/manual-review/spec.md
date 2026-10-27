# group/manual-review Specification

## Purpose

Cho chủ nhóm chọn tin của nhóm hiện ngay khi máy cho qua, hay luôn chờ quản trị nhóm duyệt — áp cho tin gửi mới và gửi lại
của mọi tài khoản, máy vẫn chấm đủ và vẫn không phạt ai (TK 9, 13, 16; chốt 26/10/2026).

## Requirements

### Requirement: Chủ nhóm bật duyệt tay mọi tin

Nhóm SHALL có cài đặt "duyệt tay mọi tin", mặc định tắt. Chủ nhóm hoặc master SHALL bật, tắt được; điều hành viên và
thành viên MUST NOT đổi được. Hồ sơ nhóm SHALL trả trạng thái của công tắc cho mọi người xem được hồ sơ đầy đủ.

#### Scenario: Chủ nhóm bật

- **WHEN** chủ nhóm bật "duyệt tay mọi tin"
- **THEN** hồ sơ nhóm mà một thành viên đọc trả công tắc đang bật

#### Scenario: Điều hành viên thử bật

- **WHEN** một điều hành viên cả nhóm bật "duyệt tay mọi tin"
- **THEN** response có HTTP 403 `FORBIDDEN` và công tắc vẫn tắt

### Requirement: Tin gửi mới và gửi lại chờ quản trị nhóm

Khi nhóm bật công tắc, lượt gửi tin mới vào nhóm và lượt gửi lại một tin không ở trạng thái "đang hiển thị" (bị từ chối,
bị gỡ, đang chờ duyệt) SHALL qua máy như mọi lượt; máy kết luận hiện đầy đủ hay hiện hạn chế thì tin MUST được giữ cho
người với lý do "nhóm duyệt tay", bất kể mức tin cậy của người đăng. Máy tự giữ thì lý do của máy ghi nguyên. Sửa tin đang
hiển thị, gia hạn và tin sàn chung MUST NOT chịu công tắc. Lần giữ vì công tắc MUST NOT tính vào "bị giữ nhiều".

#### Scenario: Tài khoản T3 gửi tin sạch

- **WHEN** nhóm bật công tắc và một thành viên T3 gửi vào nhóm một tin không trúng dấu hiệu nào
- **THEN** lượt máy ghi điểm 0 với kết quả giữ cho người vì "nhóm duyệt tay", và tin ở trạng thái chờ duyệt

#### Scenario: Máy tự giữ

- **WHEN** nhóm bật công tắc và một tin gửi vào nhóm có điểm rủi ro 75
- **THEN** lượt máy ghi giữ cho người vì điểm, không phải vì "nhóm duyệt tay"

#### Scenario: Sửa tin đang hiển thị

- **WHEN** nhóm bật công tắc sau khi một tin của nhóm đã hiển thị, và người đăng sửa mô tả tin đó mà máy cho qua
- **THEN** tin vẫn hiển thị, không có việc duyệt nào

#### Scenario: Sửa tin đang chờ

- **WHEN** người đăng sửa một tin đang chờ vì "nhóm duyệt tay"
- **THEN** bản sửa lại chờ quản trị nhóm duyệt

#### Scenario: Tin sàn chung

- **WHEN** một thành viên của nhóm bật công tắc gửi một tin lên sàn chung mà máy cho qua
- **THEN** tin hiển thị ngay

### Requirement: Tắt công tắc không thả tin đang chờ

Tắt công tắc SHALL chỉ áp cho các lượt gửi sau đó; tin đang chờ vì "nhóm duyệt tay" MUST tiếp tục chờ người duyệt.

#### Scenario: Tắt khi còn tin chờ

- **WHEN** chủ nhóm tắt công tắc lúc một tin của nhóm đang chờ vì "nhóm duyệt tay"
- **THEN** tin vẫn chờ duyệt và việc duyệt của tin vẫn mở; tin gửi vào nhóm sau đó mà máy cho qua thì hiển thị ngay
