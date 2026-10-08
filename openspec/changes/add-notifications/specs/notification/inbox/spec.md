## Purpose

Đưa mọi thông báo của hệ thống tới đúng người nhận: vào hộp thư trong app, và hiện thêm lên màn hình điện thoại
khi người đó cho phép — để người dùng luôn biết chuyện gì vừa xảy ra với mình (TK 24, TK 26).

## ADDED Requirements

### Requirement: Mọi thông báo vào hộp thư trong app

Mỗi thông báo hệ thống gửi cho một người SHALL vào hộp thư trong app của người đó, kèm nhóm thông báo và thời
điểm gửi. Hộp thư MUST chỉ người nhận xem được.

#### Scenario: Có thông báo mới

- **WHEN** hệ thống gửi cho người dùng một thông báo thuộc nhóm "tài khoản"
- **THEN** thông báo nằm trong hộp thư của người đó, ghi nhóm "tài khoản" và thời điểm gửi

#### Scenario: Xem hộp thư của mình

- **WHEN** người dùng mở hộp thư của mình
- **THEN** response có HTTP 200 và chỉ chứa thông báo gửi cho chính người đó

#### Scenario: Khách chưa đăng nhập

- **WHEN** khách chưa đăng nhập mở hộp thư
- **THEN** response có HTTP 401 `UNAUTHORIZED`

#### Scenario: Mở thông báo của người khác

- **WHEN** người dùng mở một thông báo gửi cho người khác bằng mã của nó
- **THEN** response có HTTP 404 `NOT_FOUND`, giống hệt khi mở một mã thông báo không tồn tại

### Requirement: Mỗi thông báo thuộc đúng một trong chín nhóm

Mỗi thông báo SHALL thuộc đúng một trong chín nhóm: tin nhắn · tin đăng của bạn · nhóm của bạn · báo cáo của
bạn · tài khoản · mức tin cậy và gậy · thông báo của nhóm · tin mới trong nhóm · hỗ trợ.

#### Scenario: Tin nhắn mới

- **WHEN** người dùng được báo có tin nhắn mới
- **THEN** thông báo thuộc nhóm "tin nhắn"

#### Scenario: Nhận gậy

- **WHEN** người dùng được báo vừa nhận một gậy
- **THEN** thông báo thuộc nhóm "mức tin cậy và gậy"

#### Scenario: Lên mức tin cậy

- **WHEN** người dùng được báo vừa lên mức T1
- **THEN** thông báo thuộc nhóm "mức tin cậy và gậy"

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
