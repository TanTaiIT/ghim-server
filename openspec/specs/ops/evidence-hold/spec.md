# ops/evidence-hold Specification

## Purpose

Không để bằng chứng của một báo cáo, gậy hay khiếu nại đang mở biến mất — dù do hạn lưu hay do chính các bên tự
xoá — cho tới khi việc đó đóng thêm 30 ngày (TK 25, TK 23, TK 24, cam kết 31).

## Requirements

### Requirement: Dữ liệu dính tới việc đang mở được tạm giữ

Khi một tin hay một người có báo cáo đang mở, gậy còn hiệu lực hay khiếu nại đang chờ xét, mọi dữ liệu dính tới
nó — tin, ảnh, hội thoại về tin đó — SHALL được tạm giữ. Dữ liệu đang tạm giữ MUST NOT bị xoá hẳn, kể cả khi các
bên đã tự xoá.

#### Scenario: Người đăng xoá tin đang bị báo cáo

- **WHEN** người đăng xoá một tin đang có báo cáo mở và 30 ngày trôi qua mà báo cáo chưa đóng
- **THEN** tin chưa bị xoá hẳn và người xử báo cáo vẫn mở được bản lưu của tin cùng ảnh của nó

#### Scenario: Cả hai bên xoá hội thoại về tin đang bị báo cáo

- **WHEN** cả hai bên đã xoá ở phía mình một hội thoại về một tin đang có báo cáo mở
- **THEN** hội thoại không bị xoá hẳn

#### Scenario: Xoá tài khoản khi còn gậy thường

- **WHEN** một người còn gậy thường hiệu lực xoá tài khoản và 90 ngày trôi qua trong lúc gậy chưa hết hạn
- **THEN** tin bị gỡ vì vi phạm gắn với gậy đó chưa bị xoá hẳn

#### Scenario: Xoá tài khoản khi tin đang bị báo cáo

- **WHEN** một người xoá tài khoản trong lúc một tin của mình đang có báo cáo mở, và 90 ngày trôi qua mà báo cáo
  chưa đóng
- **THEN** tin đó cùng ảnh của nó chưa bị xoá hẳn và người xử báo cáo vẫn mở được bản lưu của tin

#### Scenario: Báo cáo từ hội thoại

- **WHEN** một hội thoại được gửi kèm một báo cáo đang mở và cả hai bên đã xoá hội thoại ở phía mình
- **THEN** hội thoại không bị xoá hẳn

### Requirement: Tạm giữ thắng mọi hạn lưu

Mọi hạn lưu SHALL nhường cho tạm giữ bằng chứng: không lượt dọn nào, của bất kỳ module nào, được xoá hẳn hay ẩn
danh hoá dữ liệu đang tạm giữ, dù hạn lưu của dữ liệu đó đã qua.

#### Scenario: Hội thoại một năm không ai nhắn

- **WHEN** một hội thoại có tin nhắn cuối hơn 1 năm trước đang được gửi kèm một báo cáo đã quá hạn xử và chuyển
  lên master
- **THEN** lượt dọn kế tiếp không xoá hẳn hội thoại đó

#### Scenario: Tin đã bán quá 180 ngày

- **WHEN** một tin đã bán hơn 180 ngày trước đang có báo cáo mở
- **THEN** lượt dọn kế tiếp không xoá hẳn tin đó

### Requirement: Tạm giữ gỡ sau khi việc đóng 30 ngày

Tạm giữ SHALL kéo dài tới khi việc cuối cùng dính tới dữ liệu đó đóng thêm 30 ngày. Việc đóng là báo cáo được
người quyết, gậy hết hạn hay bị huỷ, khiếu nại có kết quả. Hết tạm giữ thì dữ liệu trở lại theo hạn lưu của nó.

#### Scenario: Báo cáo mới đóng

- **WHEN** báo cáo về một tin người đăng đã xoá được người xử bác 20 ngày trước
- **THEN** tin vẫn chưa bị xoá hẳn

#### Scenario: Đóng quá 30 ngày và hạn lưu đã qua

- **WHEN** báo cáo về một tin người đăng đã xoá hơn 30 ngày trước được đóng hơn 30 ngày trước, và tin không dính
  việc nào khác
- **THEN** tin bị xoá hẳn ở lượt dọn kế tiếp

#### Scenario: Còn một việc khác đang mở

- **WHEN** báo cáo về một tin đã đóng 40 ngày nhưng tin vẫn gắn một gậy còn hiệu lực
- **THEN** tin vẫn được tạm giữ

#### Scenario: Hết tạm giữ nhưng hạn lưu chưa tới

- **WHEN** tạm giữ của một tin đã bán được 100 ngày vừa hết
- **THEN** tin vẫn xem được như mọi tin đã bán và chỉ bị xoá hẳn khi tới hạn lưu của tin đã bán

### Requirement: Tạm giữ không làm dữ liệu đã xoá hiện lại

Tạm giữ SHALL chỉ chặn việc xoá hẳn. Dữ liệu người dùng đã tự xoá MUST NOT hiện lại với họ hay với người khác vì
đang được tạm giữ.

#### Scenario: Tin tự xoá đang tạm giữ

- **WHEN** một người khác mở đường link của một tin người đăng đã xoá nhưng đang được tạm giữ
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Hội thoại đã xoá đang tạm giữ

- **WHEN** một bên đã xoá ở phía mình một hội thoại đang được tạm giữ
- **THEN** hội thoại không hiện lại trong danh sách hội thoại của bên đó
