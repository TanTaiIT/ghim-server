## Purpose

Quyết định thành viên nào có quyền mang dòng "Thành viên nhóm X" trên tin sàn chung, để huy hiệu chỉ chứng
minh điều nhóm đã thực sự xét (TK 9, TK 10, cam kết 23).

## ADDED Requirements

### Requirement: Ai có quyền mang huy hiệu

Chỉ người đang là thành viên SHALL có quyền mang huy hiệu của nhóm, và chỉ khi vào bằng đường được xét — được
duyệt, lời mời, danh sách lớp, master giao — trong lúc nhóm là công khai · xét duyệt, hoặc là nhóm riêng tư
có bật "hiện tên nhóm trên tin sàn". Nhóm đã đóng MUST NOT cho ai quyền mang huy hiệu.

#### Scenario: Được duyệt vào nhóm xét duyệt

- **WHEN** một người vào nhóm công khai · xét duyệt qua đơn được duyệt
- **THEN** người đó có quyền mang huy hiệu của nhóm

#### Scenario: Được mời vào nhóm mở cửa

- **WHEN** một người vào nhóm công khai · mở cửa bằng lời mời
- **THEN** người đó không có quyền mang huy hiệu của nhóm

#### Scenario: Nhóm riêng tư chưa bật hiện tên

- **WHEN** một người vào nhóm riêng tư · chỉ lời mời theo danh sách lớp và nhóm chưa bật hiện tên
- **THEN** người đó không có quyền mang huy hiệu của nhóm

#### Scenario: Nhóm riêng tư đã bật hiện tên

- **WHEN** chủ của nhóm riêng tư đó bật "hiện tên nhóm trên tin sàn"
- **THEN** người vào theo danh sách lớp có quyền mang huy hiệu của nhóm

#### Scenario: Không còn là thành viên

- **WHEN** một người đang có quyền mang huy hiệu rời nhóm, bị gỡ hoặc bị cấm khỏi nhóm
- **THEN** người đó không còn quyền mang huy hiệu của nhóm

#### Scenario: Nhóm đóng

- **WHEN** nhóm đóng
- **THEN** không ai còn quyền mang huy hiệu của nhóm đó

### Requirement: Bấm tham gia không bao giờ có huy hiệu

Thành viên vào bằng bấm tham gia MUST NOT có quyền mang huy hiệu của nhóm đó, kể cả khi nhóm đổi sang có xét
duyệt sau đó.

#### Scenario: Nhóm mở cửa đổi sang xét duyệt

- **WHEN** một người vào nhóm công khai · mở cửa bằng bấm tham gia rồi nhóm đổi sang công khai · xét duyệt
- **THEN** người đó vẫn không có quyền mang huy hiệu của nhóm

### Requirement: Người dùng xem huy hiệu mình được mang

Người dùng SHALL xem được danh sách nhóm mà mình đang có quyền mang huy hiệu, và MUST chỉ thấy đúng những
nhóm đó.

#### Scenario: Thành viên của hai nhóm

- **WHEN** một người là thành viên của hai nhóm nhưng chỉ có quyền mang huy hiệu của một nhóm
- **THEN** danh sách huy hiệu của người đó chỉ có nhóm ấy

### Requirement: Công tắc hiện tên nhóm trên tin sàn

Ở nhóm riêng tư, chủ nhóm hoặc master SHALL bật tắt được "hiện tên nhóm trên tin sàn". Nhóm công khai MUST NOT
có công tắc này.

#### Scenario: Bật ở nhóm công khai

- **WHEN** chủ của một nhóm công khai bật "hiện tên nhóm trên tin sàn"
- **THEN** response có HTTP 409 `GROUP_MODE_CONFLICT`

#### Scenario: Điều hành viên thử bật

- **WHEN** một điều hành viên của nhóm riêng tư bật "hiện tên nhóm trên tin sàn"
- **THEN** response có HTTP 403 `FORBIDDEN` và công tắc không đổi

### Requirement: Quyền huy hiệu được tính lại ngay

Quyền mang huy hiệu SHALL được tính lại ngay khi nhóm đổi chế độ, đổi cách vào hay đổi công tắc hiện tên —
không chờ một lượt chạy theo lịch.

#### Scenario: Nhóm xét duyệt đổi sang mở cửa

- **WHEN** nhóm công khai · xét duyệt đổi sang công khai · mở cửa
- **THEN** ngay sau đó không thành viên nào của nhóm còn quyền mang huy hiệu

#### Scenario: Nhóm mở cửa đổi sang xét duyệt

- **WHEN** nhóm công khai · mở cửa đổi sang công khai · xét duyệt
- **THEN** thành viên vào bằng lời mời có quyền mang huy hiệu ngay, thành viên vào bằng bấm tham gia thì không

#### Scenario: Tắt hiện tên

- **WHEN** chủ của nhóm riêng tư tắt "hiện tên nhóm trên tin sàn"
- **THEN** ngay sau đó không thành viên nào của nhóm còn quyền mang huy hiệu

### Requirement: Người ngoài bấm vào huy hiệu nhóm riêng tư chỉ thấy tên

Người không phải thành viên mở một nhóm riêng tư — chẳng hạn khi bấm vào huy hiệu trên một tin sàn — SHALL
chỉ thấy tên nhóm; mọi thông tin khác của nhóm MUST NOT hiện ra.

#### Scenario: Bấm huy hiệu nhóm riêng tư

- **WHEN** một người không phải thành viên bấm vào huy hiệu của một nhóm riêng tư đã bật hiện tên
- **THEN** response chỉ có tên nhóm

#### Scenario: Thành viên mở nhóm riêng tư

- **WHEN** một thành viên mở chính nhóm riêng tư của mình
- **THEN** response có HTTP 200 với hồ sơ nhóm, không chỉ tên nhóm
