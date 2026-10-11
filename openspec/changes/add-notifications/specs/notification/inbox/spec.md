## ADDED Requirements

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
