# messaging/conversations Specification

## Purpose

Cho người mua hỏi người bán ngay trên một tin đăng — mỗi cặp tin và người mua đúng một hội thoại — mà không để
tài khoản vừa lập dùng nhắn tin để rải hàng loạt hay dò xem ai đang nói chuyện với ai (TK 24, TK 20).

## Requirements

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

Mỗi bên của hội thoại SHALL gửi được tin nhắn cho bên kia — chữ, ảnh (`messaging/message-images`) hay cả hai — và đọc
được mọi tin nhắn của hội thoại theo thứ tự gửi.

#### Scenario: Gửi tin nhắn

- **WHEN** người mua gửi một tin nhắn trong hội thoại của mình
- **THEN** response có HTTP 201 và người bán thấy tin nhắn đó khi mở hội thoại

#### Scenario: Tin nhắn rỗng

- **WHEN** một bên gửi tin nhắn không có chữ và không có ảnh
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

### Requirement: Hội thoại cho biết tin và người kia

Mỗi hội thoại một bên thấy SHALL cho biết đủ để vẽ đầu hội thoại mà không phải gọi thêm: tiêu đề, giá, có cho thương
lượng không, trạng thái và ảnh bìa của tin; ảnh đại diện của người kia; và người xem lúc này có gửi được đề nghị giá
không. Tin đã bị xoá thì tiêu đề, giá và ảnh bìa MUST để trống. Tin bị gỡ vì vi phạm MUST NOT kèm ảnh bìa (chốt
18/10/2026).

#### Scenario: Hội thoại về tin đang hiển thị

- **WHEN** người mua mở hội thoại về một tin đang hiển thị, cho thương lượng, giá 12.500.000 đồng, có 3 ảnh
- **THEN** hội thoại có tiêu đề, giá 12.500.000 đồng, cờ cho thương lượng, trạng thái đang hiển thị và ảnh đầu tiên của
  tin làm ảnh bìa

#### Scenario: Ảnh đại diện người kia

- **WHEN** người bán có ảnh đại diện và người mua xem danh sách hội thoại của mình
- **THEN** hội thoại với người bán đó kèm ảnh đại diện của người bán

#### Scenario: Người kia đã xoá tài khoản

- **WHEN** người bán đã xoá tài khoản và người mua xem hội thoại với họ
- **THEN** hội thoại không kèm ảnh đại diện, và cho biết người kia đã rời Ghim

#### Scenario: Tin đã bị xoá

- **WHEN** người đăng xoá tin sau khi đã có hội thoại về tin đó
- **THEN** hội thoại vẫn đọc được, tiêu đề, giá và ảnh bìa để trống

#### Scenario: Tin bị gỡ vì vi phạm

- **WHEN** người duyệt gỡ tin của một hội thoại vì vi phạm
- **THEN** hội thoại vẫn có tiêu đề và giá của tin, trạng thái bị gỡ, không có ảnh bìa

#### Scenario: Người mua trả giá được

- **WHEN** người mua xem hội thoại về một tin đang hiển thị, cho thương lượng, giá lớn hơn 0, không có chặn giữa hai bên
- **THEN** hội thoại cho biết người mua gửi được đề nghị giá

#### Scenario: Người bán không trả giá

- **WHEN** người bán xem cùng hội thoại đó
- **THEN** hội thoại cho biết người bán không gửi được đề nghị giá

#### Scenario: Tin đã bán

- **WHEN** người mua xem hội thoại về một tin đã bán
- **THEN** hội thoại cho biết người mua không gửi được đề nghị giá, nhưng vẫn gửi được tin nhắn

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
