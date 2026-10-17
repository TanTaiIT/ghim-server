# messaging/conversations Specification

## Purpose

Cho người mua hỏi người bán ngay trên một tin đăng — mỗi cặp tin và người mua đúng một hội thoại — mà không để
tài khoản vừa lập dùng nhắn tin để rải hàng loạt hay dò xem ai đang nói chuyện với ai (TK 24, TK 20).

## Requirements

### Requirement: Mỗi tin và một người mua có đúng một hội thoại

Hội thoại SHALL do người mua mở từ một tin và gắn với đúng tin đó; hai bên là người mua và người đăng tin. Một
tin và một người mua MUST có tối đa một hội thoại: mở lại thì vào hội thoại cũ, không sinh hội thoại thứ hai.

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

### Requirement: Ai được nhắn tin

Chỉ người dùng đã đăng nhập và đã xác nhận email SHALL mở được hội thoại hay gửi được tin nhắn. Tài khoản master
MUST NOT nhắn tin — người làm master nhắn bằng tài khoản cá nhân của mình như mọi người dùng.

#### Scenario: Khách chưa đăng nhập

- **WHEN** khách chưa đăng nhập mở hội thoại với một tin
- **THEN** response có HTTP 401 `UNAUTHORIZED`

#### Scenario: Chưa xác nhận email

- **WHEN** một tài khoản chưa xác nhận email mở hội thoại với một tin đang hiển thị
- **THEN** response có HTTP 403 `EMAIL_NOT_VERIFIED` và không hội thoại nào được tạo

#### Scenario: Tài khoản master

- **WHEN** tài khoản master mở hội thoại với một tin
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Chỉ mở hội thoại mới với tin đang hiển thị mà mình xem được

Hội thoại MỚI SHALL chỉ mở được với tin đang ở trạng thái đang hiển thị mà người mở xem được; tin "chỉ thành
viên" thì người mở phải đang là thành viên nhóm. Tin người mở không xem được MUST được đối xử như tin không tồn
tại.

#### Scenario: Tin hiển thị hạn chế, mở qua đường link

- **WHEN** người dùng mở hội thoại với một tin đang hiển thị ở mức hạn chế, vào qua đường link trực tiếp
- **THEN** hội thoại được mở như với tin hiển thị đầy đủ

#### Scenario: Tin đã bán

- **WHEN** người dùng chưa có hội thoại với một tin đã đánh dấu đã bán mở hội thoại mới với tin đó
- **THEN** response có HTTP 409 `LISTING_NOT_LIVE` và không hội thoại nào được tạo

#### Scenario: Tin hết hạn

- **WHEN** người dùng chưa có hội thoại với một tin đã hết hạn mở hội thoại mới với tin đó
- **THEN** response có HTTP 409 `LISTING_NOT_LIVE` và không hội thoại nào được tạo

#### Scenario: Tin "chỉ thành viên", người mở không phải thành viên

- **WHEN** người không phải thành viên nhóm mở hội thoại với một tin "chỉ thành viên" của nhóm đó
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Tin đang tạm ẩn

- **WHEN** người dùng mở hội thoại với một tin đang tạm ẩn, vd vì nhóm của tin bị khoá
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Tin đang chờ người duyệt

- **WHEN** người dùng mở hội thoại với một tin đang chờ người duyệt của người khác
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Không nhắn cho tin của chính mình

Người đăng tin MUST NOT mở hội thoại với tin của chính mình.

#### Scenario: Người đăng bấm nhắn tin trên tin của mình

- **WHEN** người đăng mở hội thoại với một tin đang hiển thị của chính mình
- **THEN** response có HTTP 403 `CANNOT_MESSAGE_OWN_LISTING` và không hội thoại nào được tạo

### Requirement: Gửi và đọc tin nhắn

Mỗi bên của hội thoại SHALL gửi được tin nhắn cho bên kia và đọc được mọi tin nhắn của hội thoại theo thứ tự
gửi.

#### Scenario: Gửi tin nhắn

- **WHEN** người mua gửi một tin nhắn trong hội thoại của mình
- **THEN** response có HTTP 201 và người bán thấy tin nhắn đó khi mở hội thoại

#### Scenario: Tin nhắn rỗng

- **WHEN** một bên gửi tin nhắn không có nội dung
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không tin nhắn nào được thêm

### Requirement: Hội thoại đã mở vẫn tiếp tục

Hội thoại đã mở SHALL tiếp tục nhận tin nhắn của cả hai bên dù sau đó tin đã bán, hết hạn, hay một bên rời nhóm
của tin. Điều kiện "tin đang hiển thị mà mình xem được" chỉ áp cho lượt mở hội thoại mới.

#### Scenario: Tin đã bán sau khi mở hội thoại

- **WHEN** người bán đánh dấu tin đã bán trong lúc hội thoại với một người mua đang có
- **THEN** cả hai bên vẫn gửi và nhận tin nhắn trong hội thoại đó

#### Scenario: Tin hết hạn sau khi mở hội thoại

- **WHEN** tin của một hội thoại chuyển sang hết hạn
- **THEN** cả hai bên vẫn gửi và nhận tin nhắn trong hội thoại đó

#### Scenario: Người mua rời nhóm

- **WHEN** người mua rời nhóm sau khi đã mở hội thoại với một tin "chỉ thành viên" của nhóm
- **THEN** hội thoại đó vẫn tiếp tục, nhưng người mua không mở được hội thoại mới với tin "chỉ thành viên" nào
  khác của nhóm

#### Scenario: Người đăng rời nhóm, tin tạm ẩn

- **WHEN** người đăng rời nhóm và tin "chỉ thành viên" của họ trong nhóm bị tạm ẩn
- **THEN** các hội thoại đã mở về tin đó vẫn tiếp tục

### Requirement: Giới hạn hội thoại mới mỗi ngày theo mức tin cậy

Mỗi người dùng SHALL mở tối đa số hội thoại mới mỗi ngày theo mức tin cậy hiện tại của mình: T0 10, T1 20, T2
50, T3 100 (giá trị khởi đầu). Chỉ lượt mở hội thoại mới thành công được đếm; mở lại hội thoại đã có và trả lời
trong hội thoại đã có MUST NOT bị giới hạn.

#### Scenario: Hết lượt hội thoại mới

- **WHEN** người dùng T0 đã mở 10 hội thoại mới trong cùng một ngày và mở hội thoại mới thứ 11 trong ngày đó
- **THEN** response có HTTP 429 `NEW_CONVERSATION_LIMIT` kèm thời điểm được mở hội thoại mới tiếp, và không
  hội thoại nào được tạo

#### Scenario: Mức cao hơn, trần cao hơn

- **WHEN** người dùng T2 đã mở 49 hội thoại mới trong cùng một ngày và mở hội thoại mới thứ 50
- **THEN** hội thoại được tạo

#### Scenario: Trả lời không bị giới hạn

- **WHEN** người dùng T0 đã hết lượt hội thoại mới trong ngày gửi tin nhắn trong một hội thoại đã có
- **THEN** tin nhắn được gửi bình thường

#### Scenario: Mở lại hội thoại đã có

- **WHEN** người dùng đã hết lượt hội thoại mới trong ngày bấm nhắn tin trên một tin mà mình đã có hội thoại
- **THEN** hội thoại cũ được mở, không bị từ chối

#### Scenario: Lượt bị từ chối không tính

- **WHEN** người dùng T0 đã mở 9 hội thoại mới trong ngày, bị từ chối một lượt vì tin đã bán, rồi mở một hội
  thoại mới hợp lệ
- **THEN** hội thoại đó được tạo

#### Scenario: Người bán nhận nhiều hội thoại

- **WHEN** 30 người mua khác nhau mở hội thoại với tin của một người bán T0 trong cùng một ngày
- **THEN** cả 30 hội thoại được tạo và lượt hội thoại mới của người bán không bị trừ

### Requirement: Tin nhắn qua bộ lọc cụm từ cấm của tin đăng

Mọi tin nhắn SHALL qua cùng bộ lọc cụm từ cấm áp cho tin đăng — cùng danh sách, cùng cách so, cùng chế độ chạy
thử theo luật của `screening/banned-phrases`. Bộ lọc MUST NOT tự ra gậy hay hạ mức tin cậy của người gửi, và
MUST NOT cho người gửi biết cụm nào bị trúng.

#### Scenario: Tin nhắn trúng một cụm từ cấm đang bật

- **WHEN** một người gửi tin nhắn chứa một cụm từ cấm đang bật
- **THEN** người gửi không nhận gậy, mức tin cậy không đổi, và response không nêu cụm nào bị trúng

#### Scenario: Cụm đang chạy thử

- **WHEN** một người gửi tin nhắn chỉ chứa một cụm từ cấm đang chạy thử
- **THEN** tin nhắn tới người nhận như một tin nhắn không chứa cụm cấm nào

### Requirement: Người ngoài hội thoại nhận "không tìm thấy"

Mọi thao tác trên một hội thoại — xem, đọc tin nhắn, gửi tin, xoá, báo cáo — SHALL chỉ dành cho hai bên của
hội thoại. Người khác MUST nhận đúng phản hồi như với một hội thoại không tồn tại, để không lộ việc hội thoại đó
có tồn tại.

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
