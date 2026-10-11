## Purpose

Đưa mọi thông báo của hệ thống tới đúng người nhận qua hộp thư trong app, để người dùng luôn biết chuyện gì vừa xảy
ra với mình (TK 24, TK 26).

## ADDED Requirements

### Requirement: Mọi thông báo vào hộp thư trong app

Mỗi thông báo hệ thống gửi cho một người SHALL vào hộp thư trong app của người đó, kèm nhóm thông báo và thời điểm
gửi. Hộp thư MUST chỉ người nhận xem được.

#### Scenario: Có thông báo mới

- **WHEN** đơn xin vào nhóm của một người dùng được duyệt
- **THEN** hộp thư của người đó có một thông báo thuộc nhóm "nhóm của bạn", kèm thời điểm gửi

#### Scenario: Xem hộp thư của mình

- **WHEN** người dùng mở hộp thư của mình
- **THEN** response có HTTP 200 và chỉ chứa thông báo gửi cho chính người đó, mới nhất trước

#### Scenario: Khách chưa đăng nhập

- **WHEN** khách chưa đăng nhập mở hộp thư
- **THEN** response có HTTP 401 `UNAUTHORIZED`

#### Scenario: Mở thông báo của người khác

- **WHEN** người dùng đánh dấu đã đọc một thông báo gửi cho người khác bằng mã của nó
- **THEN** response có HTTP 404 `NOT_FOUND`, giống hệt khi dùng một mã thông báo không tồn tại

### Requirement: Mỗi thông báo thuộc đúng một trong chín nhóm

Mỗi thông báo SHALL thuộc đúng một trong chín nhóm: tin nhắn · tin đăng của bạn · nhóm của bạn · báo cáo của bạn ·
tài khoản · mức tin cậy và gậy · thông báo của nhóm · tin mới trong nhóm · hỗ trợ.

#### Scenario: Chuyện về tư cách trong nhóm

- **WHEN** người dùng được báo vừa bị gỡ khỏi một nhóm
- **THEN** thông báo thuộc nhóm "nhóm của bạn"

#### Scenario: Thông báo của nhóm

- **WHEN** chủ nhóm gửi một thông báo cho nhóm
- **THEN** thông báo thành viên nhận thuộc nhóm "thông báo của nhóm"

### Requirement: Số chưa đọc và đánh dấu đã đọc

Người dùng SHALL xem được số thông báo chưa đọc của mình, và đánh dấu đã đọc từng thông báo hoặc tất cả.

#### Scenario: Đếm chưa đọc

- **WHEN** người dùng có hai thông báo chưa đọc và mở số chưa đọc
- **THEN** response có HTTP 200 với số 2

#### Scenario: Đọc một thông báo

- **WHEN** người dùng đánh dấu đã đọc một trong hai thông báo đó
- **THEN** số chưa đọc còn 1

#### Scenario: Đọc tất cả

- **WHEN** người dùng đánh dấu đã đọc tất cả
- **THEN** số chưa đọc là 0

### Requirement: Gộp chuyện lặp lại

Chuyện lặp lại theo nhóm — đơn xin vào mới — SHALL được gộp vào thông báo chưa đọc cùng loại, cùng nhóm của người
nhận thay vì thêm dòng mới. Thông báo gộp MUST chỉ nhắc lại khi lần nhắc trước đã quá 30 phút (giá trị khởi đầu).

#### Scenario: Ba đơn trong mười phút

- **WHEN** nhóm có 3 đơn xin vào mới trong 10 phút và chủ nhóm chưa đọc thông báo nào về đơn
- **THEN** hộp thư của chủ nhóm có đúng một thông báo cho biết 3 đơn đang chờ, và chỉ lần đầu có nhắc

#### Scenario: Đã đọc rồi có đơn mới

- **WHEN** chủ nhóm đã đọc thông báo gộp, rồi có thêm một đơn mới
- **THEN** hộp thư có một thông báo mới về đơn đó

#### Scenario: Quá trần nhắc

- **WHEN** thông báo gộp chưa đọc đã nhắc lần cuối 31 phút trước và có thêm một đơn mới
- **THEN** thông báo gộp được cập nhật và nhắc lại
