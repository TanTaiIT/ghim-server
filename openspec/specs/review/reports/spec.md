# review/reports Specification

## Purpose

Cho người dùng báo một tin hay một người vi phạm, đưa báo cáo tới đúng người có quyền xử, và chỉ đóng báo cáo
bằng quyết định của người (TK 23, cam kết 25).

## Requirements

### Requirement: Gửi báo cáo

Người dùng đã đăng nhập và đã xác nhận email SHALL báo cáo được một tin mình đang xem được hoặc một người, chọn đúng
một trong năm loại cố định: lừa đảo, sai thông tin, quấy rối, hàng cấm, khác.

#### Scenario: Báo cáo một tin sàn

- **WHEN** người dùng báo cáo một tin sàn đang hiển thị với loại "lừa đảo"
- **THEN** response có HTTP 201 và báo cáo ở trạng thái đang mở

#### Scenario: Báo cáo một người

- **WHEN** người dùng thấy số điện thoại của mình trên hồ sơ của người khác và báo cáo người đó với loại "sai
  thông tin"
- **THEN** response có HTTP 201 và báo cáo về người đó ở trạng thái đang mở

#### Scenario: Loại không có trong danh sách

- **WHEN** người dùng báo cáo với loại "spam"
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không báo cáo nào được tạo

#### Scenario: Khách báo cáo

- **WHEN** khách chưa đăng nhập gửi báo cáo về một tin
- **THEN** response có HTTP 401 `UNAUTHORIZED`

#### Scenario: Tin mình không xem được

- **WHEN** một người không phải thành viên báo cáo một tin "chỉ thành viên" của nhóm
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Email chưa xác nhận

- **WHEN** người dùng chưa xác nhận email báo cáo một tin sàn
- **THEN** response có HTTP 403 `EMAIL_NOT_VERIFIED` và không báo cáo nào được tạo

### Requirement: Tài khoản master không gửi báo cáo

Tài khoản master MUST NOT gửi báo cáo; người làm master muốn báo cáo thì SHALL dùng tài khoản cá nhân như mọi
người dùng (TK 5, TK 6).

#### Scenario: Master gửi báo cáo bằng tài khoản master

- **WHEN** tài khoản master gửi một báo cáo về một tin sàn
- **THEN** response có HTTP 403 `FORBIDDEN` và không báo cáo nào được tạo

#### Scenario: Người làm master dùng tài khoản cá nhân

- **WHEN** người làm master báo cáo một tin sàn bằng tài khoản cá nhân của mình
- **THEN** response có HTTP 201 và báo cáo ở trạng thái đang mở

### Requirement: Không tự báo cáo mình

Người dùng MUST NOT báo cáo chính mình hay tin của chính mình.

#### Scenario: Báo cáo tin của mình

- **WHEN** người đăng báo cáo tin của chính mình
- **THEN** response có HTTP 400 `CANNOT_REPORT_SELF` và không báo cáo nào được tạo

#### Scenario: Báo cáo chính mình

- **WHEN** người dùng báo cáo tài khoản của chính mình
- **THEN** response có HTTP 400 `CANNOT_REPORT_SELF`

### Requirement: Tối đa 10 báo cáo mỗi giờ

Mỗi người SHALL gửi được tối đa 10 báo cáo trong 60 phút gần nhất (giá trị khởi đầu).

#### Scenario: Báo cáo thứ 11 trong một giờ

- **WHEN** người dùng đã gửi 10 báo cáo trong 60 phút gần nhất và gửi thêm một báo cáo
- **THEN** response có HTTP 429 `REPORT_RATE_LIMITED` kèm thời điểm được báo cáo tiếp, và không báo cáo nào
  được tạo

#### Scenario: Lượt cũ đã ra khỏi cửa sổ

- **WHEN** báo cáo sớm nhất trong 10 báo cáo gần nhất của người dùng đã qua 61 phút và người đó gửi thêm một
  báo cáo
- **THEN** response có HTTP 201

### Requirement: Gộp báo cáo về cùng một đối tượng

Mỗi tin hay mỗi người SHALL có tối đa một báo cáo đang mở. Lượt báo mới về đối tượng đó MUST được gộp vào báo
cáo đang mở, chỉ tăng số người báo; một người báo lại cùng đối tượng MUST NOT làm tăng số người báo.

#### Scenario: Người thứ hai báo cùng một tin

- **WHEN** một tin đang có báo cáo mở của một người và một người khác báo cáo tin đó
- **THEN** tin vẫn chỉ có một báo cáo đang mở với 2 người báo

#### Scenario: Cùng một người báo lại

- **WHEN** người đã báo một tin báo lại tin đó trong lúc báo cáo còn mở
- **THEN** response có HTTP 200 và số người báo của báo cáo không đổi

#### Scenario: Báo sau khi báo cáo cũ đã đóng

- **WHEN** báo cáo về một tin đã đóng và có người báo cáo tin đó lần nữa
- **THEN** một báo cáo mới được mở với 1 người báo

### Requirement: Lừa đảo và hàng cấm thắng khi gộp

Báo cáo đang mở có ít nhất một lượt báo loại lừa đảo hay hàng cấm SHALL được xử theo luật của hai loại đó. Báo
cáo về tin trong nhóm vì vậy rời hàng của điều hành nhóm sang hàng staff ngay khi có lượt báo lừa đảo hay hàng
cấm đầu tiên.

#### Scenario: Báo cáo lừa đảo gộp vào báo cáo sai thông tin

- **WHEN** một tin trong nhóm có báo cáo "sai thông tin" đang mở ở hàng điều hành nhóm và một người khác báo
  tin đó loại "lừa đảo"
- **THEN** báo cáo hiện trong hàng staff được giao danh mục của tin và không còn hiện với điều hành nhóm

#### Scenario: Điều hành viên đang nhận báo cáo

- **WHEN** điều hành viên đang nhận báo cáo đó lúc lượt báo lừa đảo tới, rồi quyết
- **THEN** response có HTTP 409 `TASK_REASSIGNED` và báo cáo vẫn mở

### Requirement: Ai xử báo cáo

Báo cáo về tin sàn SHALL vào hàng staff được giao danh mục của tin. Báo cáo về tin trong nhóm loại lừa đảo hay
hàng cấm SHALL vào hàng staff được giao danh mục của tin và MUST NOT hiện với điều hành nhóm; loại khác vào hàng
điều hành nhóm phụ trách phạm vi của tin. Báo cáo về một người SHALL vào hàng staff được giao việc an toàn.
Master thấy mọi báo cáo.

#### Scenario: Hàng cấm trong nhóm riêng tư

- **WHEN** một tin "chỉ thành viên" của nhóm riêng tư bị báo cáo loại "hàng cấm"
- **THEN** báo cáo hiện trong hàng staff được giao danh mục của tin, không hiện trong hàng của điều hành viên
  hay chủ nhóm

#### Scenario: Điều hành viên mở báo cáo hàng cấm bằng mã việc

- **WHEN** điều hành viên của nhóm nhận báo cáo "hàng cấm" về tin trong nhóm mình bằng mã việc
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Sai thông tin trong nhóm

- **WHEN** một tin trong nhóm bị báo cáo loại "sai thông tin"
- **THEN** báo cáo hiện trong hàng của điều hành viên phụ trách phạm vi của tin

#### Scenario: Báo cáo về một người

- **WHEN** một người bị báo cáo loại "quấy rối"
- **THEN** báo cáo hiện trong hàng của staff được giao việc an toàn, không hiện với staff chỉ được giao danh
  mục

#### Scenario: Staff việc an toàn là người bị báo

- **WHEN** người bị báo cáo là một staff được giao việc an toàn
- **THEN** báo cáo không hiện trong hàng của người đó mà hiện cho staff việc an toàn khác, không còn ai thì
  cho master

### Requirement: Người báo không xử báo cáo mình đã gửi

Người đã gửi một lượt báo, và tài khoản dùng chung máy với họ, MUST NOT xử báo cáo đó; báo cáo đi cho người kế tiếp
trong chuỗi chuyển tiếp (chốt 16/10/2026).

#### Scenario: Staff báo một tin thuộc danh mục mình

- **WHEN** staff được giao danh mục của một tin sàn báo cáo tin đó bằng tài khoản của mình
- **THEN** báo cáo không hiện trong hàng của staff đó mà hiện cho staff khác cùng danh mục, không còn ai thì cho master

### Requirement: Báo cáo quá hạn chuyển master

Báo cáo quá 72 giờ (giá trị khởi đầu) chưa có quyết định SHALL được chuyển sang hàng master; tin đang tạm ẩn
vì báo cáo MUST vẫn tạm ẩn.

#### Scenario: Báo cáo không ai xử trong 72 giờ

- **WHEN** một báo cáo về tin sàn vào hàng lúc 08:00 thứ Hai và tới 08:00 thứ Năm chưa ai quyết
- **THEN** báo cáo nằm trong hàng của master và vẫn đang mở

#### Scenario: Tin đang tạm ẩn vì báo cáo

- **WHEN** báo cáo về một tin đang tạm ẩn vì nhiều người báo quá 72 giờ
- **THEN** báo cáo chuyển sang hàng master và tin vẫn tạm ẩn

### Requirement: Báo cáo chỉ đóng bằng quyết định của người

Báo cáo SHALL chỉ đóng khi người xử ra quyết định "đúng" hoặc "bác". Báo cáo MUST NOT tự đóng vì quá hạn, vì
người đăng sửa tin, vì máy cho bản sửa qua, hay vì người đăng tin bị báo cáo hoặc người bị báo cáo tự xoá tin,
xoá tài khoản (TK 23).

#### Scenario: Người đăng sửa tin đang bị báo cáo

- **WHEN** người đăng sửa một tin đang có báo cáo mở và máy cho bản sửa qua
- **THEN** báo cáo vẫn mở trong hàng chờ

#### Scenario: Quá hạn mà chưa ai quyết

- **WHEN** báo cáo quá 72 giờ chưa có quyết định
- **THEN** báo cáo vẫn mở, chỉ chuyển sang hàng master

### Requirement: Quyết định về báo cáo

Quyết định trên một việc có lý do báo cáo SHALL nói rõ báo cáo "đúng" hay "bác". Quyết định đóng báo cáo cùng
mọi lượt báo đã gộp vào nó, và mọi người báo nhận cùng một kết quả.

#### Scenario: Thiếu kết quả báo cáo

- **WHEN** người xử quyết một việc có lý do báo cáo mà không chọn "đúng" hay "bác"
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và báo cáo vẫn mở

#### Scenario: Bác một báo cáo có ba người báo

- **WHEN** người xử bác một báo cáo có 3 người báo
- **THEN** báo cáo đóng và cả 3 lượt báo mang kết quả "bác"

### Requirement: Hệ quả khi báo cáo đúng

Báo cáo "đúng" SHALL kèm các hệ quả người xử chọn trong phạm vi quyền của mình: gỡ tin (staff được giao danh
mục của tin, master), gỡ tin khỏi nhóm hay cấm người đăng khỏi nhóm (điều hành nhóm, master), khoá tài khoản
(chỉ master). Hệ quả ngoài quyền MUST bị từ chối và không có gì thay đổi.

#### Scenario: Staff gỡ tin

- **WHEN** staff được giao danh mục của tin xác nhận đúng một báo cáo về tin sàn và chọn gỡ tin
- **THEN** tin chuyển sang bị gỡ và báo cáo đóng với kết quả "đúng"

#### Scenario: Điều hành viên cấm khỏi nhóm

- **WHEN** điều hành viên xác nhận đúng một báo cáo "quấy rối" về tin trong nhóm và chọn cấm người đăng khỏi
  nhóm
- **THEN** người đăng không còn là thành viên của nhóm và báo cáo đóng với kết quả "đúng"

#### Scenario: Staff chọn khoá tài khoản

- **WHEN** staff xác nhận đúng một báo cáo và chọn khoá tài khoản người đăng
- **THEN** response có HTTP 403 `FORBIDDEN`, tài khoản không bị khoá và báo cáo vẫn mở

#### Scenario: Master khoá tài khoản

- **WHEN** master xác nhận đúng một báo cáo lừa đảo về một người và chọn khoá tài khoản
- **THEN** tài khoản bị khoá và báo cáo đóng với kết quả "đúng"

### Requirement: Người báo được báo kết quả

Khi báo cáo đóng, mỗi người báo SHALL được báo kết quả "đúng" hay "bác", và xem được các báo cáo mình đã gửi
cùng trạng thái, kết quả. Người báo MUST NOT thấy danh tính những người báo khác.

#### Scenario: Xem báo cáo đã đóng

- **WHEN** báo cáo mà người dùng đã gửi được người xử bác, rồi người đó xem các báo cáo của mình
- **THEN** người đó thấy báo cáo đã đóng với kết quả "bác"

#### Scenario: Không thấy người báo khác

- **WHEN** một trong 3 người báo xem báo cáo của mình
- **THEN** response không chứa danh tính hai người báo còn lại

#### Scenario: Thông báo kết quả

- **WHEN** người xử xác nhận đúng một báo cáo có 2 người báo
- **THEN** mỗi người báo có một thông báo trong hộp thư, nhóm "báo cáo của bạn", nói báo cáo có vi phạm — không nêu hệ
  quả

### Requirement: Người bị báo cáo không biết ai báo

Mọi response gửi cho người bị báo cáo hay người đăng tin bị báo cáo MUST NOT chứa danh tính người báo.

#### Scenario: Người đăng xem tin đang bị báo cáo

- **WHEN** người đăng mở tin của mình đang có báo cáo mở và xem bảng uy tín của mình
- **THEN** không response nào chứa tên hay mã tài khoản của người báo

### Requirement: Người xử thấy báo cáo liên quan

Người đang nhận một việc về một tin hay một người SHALL thấy các báo cáo về tin đó và về người đăng, kể cả báo cáo đã
đóng: loại, số người báo, thời điểm từng lượt báo và kết quả. Người xử MUST NOT thấy danh tính người báo.

#### Scenario: Việc về tin đang bị báo nhiều lần

- **WHEN** staff nhận việc về một tin có báo cáo đang mở với 3 lượt báo loại "lừa đảo"
- **THEN** staff thấy loại "lừa đảo", 3 người báo và thời điểm từng lượt báo

### Requirement: Báo cáo ngay từ hội thoại

Mỗi bên của một hội thoại SHALL báo cáo được bên kia ngay từ hội thoại, vd khi bị quấy rối hay lừa đảo. Báo cáo
MUST mang theo hội thoại đó làm bằng chứng và theo mọi luật chung của báo cáo.

#### Scenario: Báo cáo quấy rối từ hội thoại

- **WHEN** người mua gửi báo cáo loại "quấy rối" về người bán từ hội thoại của hai người
- **THEN** response có HTTP 201 và báo cáo được tạo kèm hội thoại đó

#### Scenario: Hội thoại về tin đã bán

- **WHEN** người mua gửi báo cáo loại "lừa đảo" từ một hội thoại mà tin của nó đã bán
- **THEN** báo cáo được tạo kèm hội thoại, như với hội thoại về tin đang hiển thị

#### Scenario: Đã chặn rồi mới báo cáo

- **WHEN** A đã chặn B rồi gửi báo cáo về B từ hội thoại chung
- **THEN** báo cáo được tạo kèm hội thoại; việc chặn không cản báo cáo

#### Scenario: Thiếu loại báo cáo

- **WHEN** một bên gửi báo cáo từ hội thoại mà không chọn loại báo cáo
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không báo cáo nào được tạo

### Requirement: Người xử đọc được hội thoại bị báo cáo

Người xử một báo cáo gửi từ hội thoại SHALL đọc được mọi tin nhắn của hội thoại đó cho tới khi báo cáo đóng, kể
cả khi một hay cả hai bên đã xoá hội thoại ở phía mình.

#### Scenario: Người bị báo xoá hội thoại ngay sau khi bị báo

- **WHEN** người bị báo cáo xoá hội thoại ở phía mình ngay sau khi báo cáo được gửi
- **THEN** người xử báo cáo vẫn đọc được đủ mọi tin nhắn của hội thoại

#### Scenario: Cả hai bên đã xoá

- **WHEN** người báo và người bị báo đều đã xoá hội thoại ở phía mình trước khi báo cáo được xử
- **THEN** người xử báo cáo vẫn đọc được đủ mọi tin nhắn của hội thoại
