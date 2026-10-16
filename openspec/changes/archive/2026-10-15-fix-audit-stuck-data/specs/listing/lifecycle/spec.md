## MODIFIED Requirements

### Requirement: Mũi tên của người đăng

Người đăng SHALL đi được đúng các mũi tên: gửi (nháp → đang kiểm); rút về (chờ duyệt → nháp, trừ tin đã rời nhóm hẳn —
listing/editing); sửa (chờ duyệt →
đang kiểm, đang hiển thị → đang kiểm, bị từ chối hay bị gỡ → đang kiểm khi lý do là sai sót — tin vi phạm xem
review/decisions); gia hạn (hết hạn → đang kiểm); gia hạn sớm (đang hiển thị → đang kiểm, trong 7 ngày cuối —
xem listing/display-period); đánh dấu đã bán (đang hiển thị → đã bán, hết hạn → đã bán).

#### Scenario: Gia hạn sớm tin đang hiển thị

- **WHEN** người đăng gia hạn sớm một tin đang hiển thị còn 5 ngày
- **THEN** tin chuyển sang đang kiểm, đi như khi sửa tin

#### Scenario: Rút tin chờ duyệt về nháp

- **WHEN** người đăng rút về một tin đang chờ duyệt
- **THEN** tin trở về trạng thái nháp

#### Scenario: Đánh dấu đã bán một tin hết hạn

- **WHEN** người đăng đánh dấu đã bán một tin hết hạn
- **THEN** tin chuyển sang đã bán

#### Scenario: Sửa tin bị gỡ vì sai sót

- **WHEN** người đăng sửa một tin bị gỡ với lý do sai sót
- **THEN** tin chuyển sang đang kiểm

#### Scenario: Người khác đi mũi tên của người đăng

- **WHEN** một người dùng khác đánh dấu đã bán một tin đang hiển thị không phải của mình
- **THEN** response có HTTP 403 `FORBIDDEN` và tin vẫn đang hiển thị

#### Scenario: Rút về tin đã rời nhóm hẳn

- **WHEN** người đăng rút về một tin đang chờ duyệt của nhóm vừa đóng
- **THEN** response có HTTP 409 `LISTING_DETACHED` và tin vẫn chờ duyệt
