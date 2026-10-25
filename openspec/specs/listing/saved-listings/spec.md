# listing/saved-listings Specification

## Purpose
Cho người đã đăng nhập lưu tin để xem lại theo đúng luật "ai thấy một tin" — lưu không thành cách dò tin ẩn, và không ai
khác biết ai lưu tin nào (TK 15).

## Requirements

### Requirement: Lưu một tin

Người đã đăng nhập SHALL lưu được một tin mà mình đang mở được theo luật "ai thấy một tin" (`listing/visibility`). Lưu
lại một tin đã lưu MUST NOT đổi gì và MUST NOT báo lỗi. Tin không có, đã xoá, hay người đó không được thấy MUST trả lời
như tin không tồn tại.

#### Scenario: Lưu tin đang hiện

- **WHEN** người dùng đã đăng nhập lưu một tin sàn chung đang hiện
- **THEN** response có HTTP 204 và tin có trong danh sách đã lưu của người đó

#### Scenario: Lưu lại tin đã lưu

- **WHEN** người dùng lưu một tin đã có trong danh sách đã lưu của mình
- **THEN** response có HTTP 204 và tin vẫn chỉ có một lần trong danh sách

#### Scenario: Khách lưu tin

- **WHEN** người chưa đăng nhập lưu một tin
- **THEN** response có HTTP 401 `UNAUTHORIZED`

#### Scenario: Tin "chỉ thành viên" của nhóm mình không ở

- **WHEN** người dùng không ở nhóm lưu một tin "chỉ thành viên" của nhóm đó
- **THEN** response có HTTP 404 `NOT_FOUND`, giống hệt khi tin không tồn tại

#### Scenario: Tin đã xoá

- **WHEN** người dùng lưu một tin đã bị người đăng xoá
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Mã tin sai dạng

- **WHEN** người dùng lưu một tin bằng mã không đúng dạng mã tin
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

### Requirement: Bỏ lưu một tin

Người đã đăng nhập SHALL bỏ lưu được một tin trong danh sách của mình. Bỏ lưu một tin chưa lưu, hay tin đã xoá, MUST NOT
báo lỗi.

#### Scenario: Bỏ lưu

- **WHEN** người dùng bỏ lưu một tin đã lưu
- **THEN** response có HTTP 204 và tin không còn trong danh sách đã lưu

#### Scenario: Bỏ lưu tin chưa lưu

- **WHEN** người dùng bỏ lưu một tin chưa từng lưu
- **THEN** response có HTTP 204 và danh sách đã lưu không đổi

### Requirement: Danh sách tin đã lưu

Người đã đăng nhập SHALL xem được những tin mình đã lưu mà mình còn mở được — tin đang hiển thị (kể cả hạn chế), đã bán
hay hết hạn, mỗi tin kèm trạng thái; tin "chỉ thành viên" chỉ khi còn là thành viên nhóm đó — lưu gần nhất trước, theo
trang. Tin tạm ẩn, bị gỡ, đã xoá, hay "chỉ thành viên" của nhóm người lưu đã rời MUST NOT có trong danh sách, nhưng lần
lưu vẫn còn: tin mở được lại thì có lại trong danh sách.

#### Scenario: Lưu gần nhất trước

- **WHEN** người dùng lưu tin A rồi tin B
- **THEN** danh sách đã lưu có B trước A

#### Scenario: Theo trang

- **WHEN** người dùng đã lưu 3 tin và mở danh sách với `limit=2`
- **THEN** trang đầu có 2 tin kèm con trỏ, trang sau có tin còn lại và con trỏ rỗng

#### Scenario: Tin đã bán, hết hạn

- **WHEN** người đăng đánh dấu đã bán một tin người dùng đã lưu, và một tin đã lưu khác hết hạn hiển thị
- **THEN** cả hai tin vẫn có trong danh sách đã lưu, tin này mang trạng thái đã bán, tin kia mang trạng thái hết hạn

#### Scenario: Tin tạm ẩn rồi hiện lại

- **WHEN** một tin đã lưu bị tạm ẩn vì danh mục bị tắt, rồi danh mục được bật lại
- **THEN** tin không có trong danh sách lúc danh mục tắt, và có lại sau khi danh mục bật

#### Scenario: Rời nhóm

- **WHEN** thành viên lưu một tin "chỉ thành viên" của nhóm rồi rời nhóm
- **THEN** tin đó không có trong danh sách đã lưu của người đó

#### Scenario: Khách xem danh sách đã lưu

- **WHEN** người chưa đăng nhập mở danh sách tin đã lưu
- **THEN** response có HTTP 401 `UNAUTHORIZED`

### Requirement: Mã các tin đã lưu

Người đã đăng nhập SHALL lấy được mã của mọi tin mình đã lưu trong một lượt, để đánh dấu tin đã lưu trên thẻ tin ở bất kỳ
màn nào.

#### Scenario: Đánh dấu thẻ tin

- **WHEN** người dùng đã lưu tin A và tin B rồi lấy mã các tin đã lưu
- **THEN** response có đúng mã của A và B

### Requirement: Không ai khác biết ai lưu tin

Việc một người lưu tin MUST chỉ người đó biết: người đăng và mọi người khác MUST NOT thấy ai đã lưu hay bao nhiêu người
đã lưu một tin.

#### Scenario: Người đăng xem tin của mình

- **WHEN** một người đã lưu tin của người bán, rồi người bán mở tin đó và danh sách tin của mình
- **THEN** không response nào cho người bán nêu người đã lưu hay số lượt lưu

### Requirement: Xoá tài khoản bỏ mọi tin đã lưu

Khi một tài khoản bị xoá, mọi tin tài khoản đó đã lưu SHALL bị bỏ.

#### Scenario: Xoá tài khoản

- **WHEN** người dùng đã lưu hai tin rồi xoá tài khoản
- **THEN** không còn lần lưu nào của tài khoản đó
