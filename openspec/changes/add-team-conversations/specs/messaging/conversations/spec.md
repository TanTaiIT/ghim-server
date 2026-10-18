## MODIFIED Requirements

### Requirement: Mỗi tin và một người mua có đúng một hội thoại

Hội thoại SHALL thuộc một trong ba loại: về một tin, với Hỗ trợ Ghim (`messaging/support-chat`), hay với quản trị một
nhóm (`messaging/group-admin-chat`); hai loại sau gọi chung là hội thoại với một đội (chốt 18/10/2026). Hội thoại về
tin SHALL do người mua mở từ một tin và gắn với đúng tin đó; hai bên là người mua và người đăng tin. Một tin và một
người mua MUST có tối đa một hội thoại: mở lại thì vào hội thoại cũ, không sinh hội thoại thứ hai.

#### Scenario: Mở hội thoại lần đầu

- **WHEN** một người dùng mở hội thoại với một tin đang hiển thị của người khác mà mình xem được
- **THEN** response có HTTP 201 và hội thoại mới có đúng hai bên: người mở và người đăng tin

#### Scenario: Bấm nhắn tin lại trên cùng một tin

- **WHEN** người mua đã có hội thoại với tin X bấm nhắn tin trên tin X lần nữa
- **THEN** response trả về đúng hội thoại cũ và không có hội thoại mới nào được tạo

#### Scenario: Hai yêu cầu mở cùng lúc

- **WHEN** người mua gửi hai yêu cầu mở hội thoại với cùng một tin cùng một lúc
- **THEN** chỉ có một hội thoại cho cặp tin và người mua đó

#### Scenario: Người mua đã xoá hội thoại ở phía mình

- **WHEN** người mua đã xoá hội thoại về tin X ở phía mình rồi bấm nhắn tin trên tin X
- **THEN** hệ thống không tạo hội thoại thứ hai cho cặp tin X và người mua đó

#### Scenario: Ba loại hội thoại trong một danh sách

- **WHEN** người dùng có một hội thoại về tin, một hội thoại hỗ trợ và một hội thoại với quản trị một nhóm
- **THEN** danh sách hội thoại của người dùng có cả ba, mỗi hội thoại cho biết loại của nó

### Requirement: Người ngoài hội thoại nhận "không tìm thấy"

Mọi thao tác trên một hội thoại — xem, đọc tin nhắn, gửi tin, xoá, báo cáo — SHALL chỉ dành cho các bên của hội
thoại: hai bên của hội thoại về tin; với hội thoại với một đội, người dùng và người đang ở trong đội — staff đang mang
quyền "hỗ trợ người dùng" qua bàn vận hành, chủ nhóm và điều hành viên đang giữ vai qua app. Người khác MUST nhận đúng
phản hồi như với một hội thoại không tồn tại, để không lộ việc hội thoại đó có tồn tại.

#### Scenario: Người dùng khác mở một hội thoại có thật

- **WHEN** một người dùng không phải hai bên mở một hội thoại có thật bằng mã của nó
- **THEN** response có HTTP 404 `NOT_FOUND`, giống hệt khi mở một mã hội thoại không tồn tại

#### Scenario: Gửi tin vào hội thoại của người khác

- **WHEN** một người dùng không phải hai bên gửi tin nhắn vào một hội thoại có thật
- **THEN** response có HTTP 404 `NOT_FOUND` và không tin nhắn nào được thêm

#### Scenario: Báo cáo hội thoại của người khác

- **WHEN** một người dùng không phải hai bên gửi báo cáo từ một hội thoại có thật
- **THEN** response có HTTP 404 `NOT_FOUND` và không báo cáo nào được tạo

#### Scenario: Staff đi qua app

- **WHEN** một tài khoản mang quyền staff, không phải một bên, mở một hội thoại có thật qua app
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Thành viên thường mở hội thoại với quản trị của người khác

- **WHEN** một thành viên không giữ vai quản trị mở hội thoại của một người dùng khác với quản trị nhóm mình
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Quản trị nhóm khác

- **WHEN** chủ nhóm Y mở hội thoại của một người dùng với quản trị nhóm X
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Tin nhắn qua bộ lọc cụm từ cấm của tin đăng

Mọi tin nhắn của người dùng — kể cả của chủ nhóm và điều hành viên khi trả lời thay nhóm — SHALL qua cùng bộ lọc cụm từ
cấm áp cho tin đăng: cùng danh sách, cùng cách so, cùng chế độ chạy thử theo luật của `screening/banned-phrases`. Tin
nhắn staff hỗ trợ gửi từ bàn vận hành MUST NOT qua bộ lọc: staff cần nhắc đúng cụm lừa đảo để cảnh báo người dùng.
Bộ lọc MUST NOT tự ra gậy hay hạ mức tin cậy của người gửi, và MUST NOT cho người gửi biết cụm nào bị trúng.

#### Scenario: Tin nhắn trúng một cụm từ cấm đang bật

- **WHEN** một người gửi tin nhắn chứa một cụm từ cấm đang bật
- **THEN** người gửi không nhận gậy, mức tin cậy không đổi, và response không nêu cụm nào bị trúng

#### Scenario: Cụm đang chạy thử

- **WHEN** một người gửi tin nhắn chỉ chứa một cụm từ cấm đang chạy thử
- **THEN** tin nhắn tới người nhận như một tin nhắn không chứa cụm cấm nào

#### Scenario: Quản trị nhóm trả lời bằng cụm từ cấm

- **WHEN** điều hành viên trả lời người dùng bằng một tin nhắn chứa cụm từ cấm mức chắc đang bật
- **THEN** response có HTTP 409 `MESSAGE_NOT_ALLOWED` và người dùng không nhận được tin nhắn đó

#### Scenario: Staff hỗ trợ cảnh báo bằng đúng cụm lừa đảo

- **WHEN** staff hỗ trợ trả lời "đừng chuyển khoản đặt cọc trước" và cụm đó là cụm từ cấm mức chắc đang bật
- **THEN** response có HTTP 201 và người dùng nhận được tin nhắn đó

## ADDED Requirements

### Requirement: Một người trong đội đọc là cả đội đã đọc

Với hội thoại với một đội, trạng thái đã đọc phía đội SHALL là của chung cả đội: một người trong đội đánh dấu đã đọc
thì hội thoại hết chưa đọc với mọi người trong đội. Phía người dùng đọc như hội thoại về tin.

#### Scenario: Chủ nhóm đọc

- **WHEN** người dùng gửi 3 tin nhắn cho quản trị nhóm và chủ nhóm đánh dấu đã đọc
- **THEN** điều hành viên của nhóm thấy hội thoại đó không còn tin chưa đọc

#### Scenario: Staff hỗ trợ đọc

- **WHEN** một staff hỗ trợ đánh dấu đã đọc một hội thoại hỗ trợ
- **THEN** staff hỗ trợ khác thấy hội thoại đó không còn tin chưa đọc, nhưng hội thoại vẫn đang chờ trả lời nếu đội
  chưa trả lời

### Requirement: Hội thoại với một đội cho biết đội

Hội thoại với một đội SHALL không gắn tin nào. Người dùng SHALL thấy bên kia là đội — "Hỗ trợ Ghim", hay "Quản trị
nhóm «tên nhóm»" kèm mã nhóm — và MUST NOT gửi được đề nghị giá trong đó. Người trong đội SHALL thấy bên kia là người
dùng, với tên và ảnh đại diện như hội thoại về tin.

#### Scenario: Người dùng xem hội thoại với quản trị nhóm

- **WHEN** người dùng xem hội thoại với quản trị nhóm "Hội Nhiếp ảnh Sài Gòn"
- **THEN** hội thoại không gắn tin nào, bên kia là "Quản trị nhóm «Hội Nhiếp ảnh Sài Gòn»" kèm mã nhóm, và người dùng
  không gửi được đề nghị giá

#### Scenario: Người dùng xem hội thoại hỗ trợ

- **WHEN** người dùng xem hội thoại hỗ trợ của mình
- **THEN** bên kia là "Hỗ trợ Ghim", không kèm mã tài khoản nào

#### Scenario: Báo cáo từ hội thoại với một đội

- **WHEN** người dùng báo cáo từ hội thoại của mình với Hỗ trợ Ghim hay với quản trị một nhóm
- **THEN** response có HTTP 409 `CONVERSATION_NOT_REPORTABLE` và không báo cáo nào được tạo — bên kia là cả đội, chưa
  có đối tượng nào để báo

#### Scenario: Quản trị xem hội thoại

- **WHEN** chủ nhóm xem hội thoại của một người dùng với quản trị nhóm mình
- **THEN** bên kia là người dùng đó, kèm tên và ảnh đại diện, cùng tên nhóm của hội thoại
