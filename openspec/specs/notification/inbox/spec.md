# notification/inbox Specification

## Purpose

Đưa mọi thông báo của hệ thống tới đúng người nhận qua hộp thư trong app, để người dùng luôn biết chuyện gì vừa xảy
ra với mình (TK 24, TK 26).

## Requirements

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

### Requirement: Báo tin nhắn mới cho bên nhận

Mỗi tin nhắn mới trong một hội thoại SHALL được báo cho bên nhận bằng thông báo nhóm "tin nhắn". Người gửi MUST
NOT nhận thông báo về tin nhắn của chính mình.

#### Scenario: Người bán nhận tin nhắn

- **WHEN** người mua gửi một tin nhắn trong hội thoại với người bán
- **THEN** người bán được báo về tin nhắn đó bằng thông báo nhóm "tin nhắn"

#### Scenario: Người gửi không tự nhận thông báo

- **WHEN** người mua gửi một tin nhắn
- **THEN** người mua không nhận thông báo nào về tin nhắn đó

#### Scenario: Tin nhắn không gửi được vì bị chặn

- **WHEN** một tin nhắn bị từ chối vì hai người đã chặn nhau
- **THEN** không ai nhận thông báo về tin nhắn đó

### Requirement: Hiện thông báo lên màn hình điện thoại khi được cho phép

Thông báo SHALL hiện thêm lên màn hình một điện thoại chỉ khi người nhận đã cho phép trên máy đó. Máy không còn
phiên đăng nhập nào của người nhận MUST NOT nhận thông báo của họ.

#### Scenario: Đã cho phép

- **WHEN** người dùng đã cho phép hiện thông báo trên điện thoại và có một thông báo nhóm "tài khoản" gửi tới
- **THEN** thông báo hiện lên màn hình điện thoại đó và nằm trong hộp thư

#### Scenario: Chưa cho phép

- **WHEN** người dùng chưa cho phép hiện thông báo trên điện thoại và có một thông báo gửi tới
- **THEN** thông báo nằm trong hộp thư và không hiện lên màn hình điện thoại đó

#### Scenario: Máy đã đăng xuất

- **WHEN** người dùng đăng xuất trên một điện thoại rồi có thông báo gửi tới
- **THEN** điện thoại đó không hiện thông báo

#### Scenario: Phiên bị thu hồi khi khoá tài khoản

- **WHEN** master khoá một tài khoản và mọi phiên của nó bị thu hồi
- **THEN** không điện thoại nào từng đăng nhập tài khoản đó hiện thông báo của nó nữa

### Requirement: Không đẩy tin nhắn của hội thoại đang mở

Khi người nhận đang mở đúng một hội thoại, tin nhắn mới của hội thoại đó MUST NOT hiện lên màn hình điện thoại.
Tin nhắn của hội thoại khác SHALL vẫn hiện như thường.

#### Scenario: Đang mở đúng hội thoại

- **WHEN** người bán chỉ đăng nhập trên một điện thoại, đang mở hội thoại X, và người mua gửi tin nhắn trong X
- **THEN** không có thông báo nào về tin nhắn đó hiện lên màn hình điện thoại của người bán

#### Scenario: Đang mở hội thoại khác

- **WHEN** người bán đang mở hội thoại Y và có tin nhắn mới trong hội thoại X
- **THEN** thông báo về tin nhắn trong X hiện lên màn hình như thường

#### Scenario: Đã đóng hội thoại

- **WHEN** người bán vừa đóng hội thoại X rồi người mua gửi tin nhắn trong X
- **THEN** thông báo về tin nhắn đó hiện lên màn hình như thường

### Requirement: Báo đề nghị giá và câu trả lời

Đề nghị giá mới SHALL được báo cho người bán, và câu trả lời của người bán SHALL được báo cho người mua, bằng thông báo
nhóm "tin nhắn" như một tin nhắn mới của hội thoại đó — cùng luật gộp, nhắc và không đẩy khi đang mở đúng hội thoại.
Câu nhắc nêu số tiền và kết quả, không nêu gì khác. Người gửi MUST NOT nhận thông báo về đề nghị hay câu trả lời của
chính mình.

#### Scenario: Người bán nhận đề nghị

- **WHEN** người mua gửi đề nghị 12.000.000 đồng
- **THEN** người bán được báo bằng thông báo nhóm "tin nhắn" nêu số tiền 12.000.000 đồng, và người mua không nhận thông
  báo nào về đề nghị đó

#### Scenario: Người mua nhận câu trả lời

- **WHEN** người bán chấp nhận đề nghị 12.000.000 đồng
- **THEN** người mua được báo bằng thông báo nhóm "tin nhắn" rằng người bán đã chấp nhận 12.000.000 đồng

#### Scenario: Đề nghị bị thay không báo

- **WHEN** đề nghị đang chờ chuyển sang "đã thay" vì người mua gửi đề nghị mới
- **THEN** người bán chỉ được báo về đề nghị mới, không có thông báo riêng nào về đề nghị bị thay

#### Scenario: App đang nối realtime

- **WHEN** người mua đang nối realtime và người bán trả lời đề nghị của người mua
- **THEN** kết nối của người mua nhận báo hiệu tin nhắn của hội thoại đó đã đổi, để app tải lại

### Requirement: Báo tin nhắn của hội thoại với một đội

Tin nhắn của đội tới người dùng SHALL được báo cho người dùng, ký tên đội: tin nhắn của Hỗ trợ Ghim vào nhóm "hỗ trợ",
tin nhắn của quản trị nhóm vào nhóm "tin nhắn". Tin nhắn của người dùng tới quản trị một nhóm SHALL được báo cho mọi
chủ nhóm và điều hành viên đang giữ vai, bằng nhóm "tin nhắn". Staff hỗ trợ MUST NOT nhận thông báo vào hộp thư cho
từng tin nhắn hỗ trợ — hàng trên bàn vận hành là chỗ của họ. Người trong đội gửi tin MUST NOT làm người khác trong đội
nhận thông báo.

#### Scenario: Người dùng nhận trả lời của hỗ trợ

- **WHEN** staff hỗ trợ trả lời người dùng
- **THEN** người dùng nhận thông báo nhóm "hỗ trợ" ký "Hỗ trợ Ghim", không nêu tên staff

#### Scenario: Người dùng nhận trả lời của quản trị nhóm

- **WHEN** điều hành viên nhóm "Hội Nhiếp ảnh Sài Gòn" trả lời người dùng
- **THEN** người dùng nhận thông báo nhóm "tin nhắn" ký "Quản trị nhóm «Hội Nhiếp ảnh Sài Gòn»"

#### Scenario: Quản trị nhận tin của người dùng

- **WHEN** người dùng nhắn quản trị một nhóm có chủ nhóm và hai điều hành viên
- **THEN** cả ba nhận thông báo nhóm "tin nhắn" về tin nhắn đó

#### Scenario: Điều hành viên trả lời không báo cho đội

- **WHEN** một điều hành viên trả lời người dùng
- **THEN** chủ nhóm và điều hành viên khác không nhận thông báo nào về tin nhắn đó

#### Scenario: Staff hỗ trợ không nhận thông báo vào hộp thư

- **WHEN** người dùng nhắn hỗ trợ
- **THEN** không staff hỗ trợ nào nhận thông báo vào hộp thư về tin nhắn đó
