## Purpose

Nhận ra các tài khoản đăng tin từ cùng một chiếc máy — dấu hiệu thay cho SMS để chặn một người lập nhiều
tài khoản bằng nhiều email (TK 8). Capability này chỉ ghi và đánh dấu; hệ quả lên tin đăng nằm ở máy duyệt.

## ADDED Requirements

### Requirement: Ghi dấu thiết bị khi đăng tin

Mỗi lượt gửi tin SHALL ghi lại dấu thiết bị của máy gửi, gắn với tài khoản gửi. Đăng nhập hay xem tin MUST
NOT được tính — điện thoại cũ qua tay nhiều chủ, chỉ việc đăng tin mới nói lên ai đang dùng máy.

#### Scenario: Gửi tin từ một máy

- **WHEN** một tài khoản gửi tin từ một máy
- **THEN** máy đó được ghi nhận là đã có tài khoản này đăng tin, kèm thời điểm

#### Scenario: Chỉ đăng nhập, không đăng tin

- **WHEN** một tài khoản chỉ đăng nhập trên máy mà không gửi tin nào
- **THEN** tài khoản đó không được tính vào số tài khoản đăng tin của máy

### Requirement: Đánh dấu tài khoản thứ tư trên một máy

Hệ thống SHALL đếm số tài khoản khác nhau đã đăng tin từ một máy trong 90 ngày gần nhất (giá trị khởi đầu).
Ba tài khoản đầu không bị đánh dấu; tài khoản thứ tư trở đi SHALL bị đánh dấu "nhiều tài khoản trên một
máy". Việc đánh dấu MUST NOT chặn đăng nhập hay chặn cả máy.

#### Scenario: Tài khoản thứ ba

- **WHEN** hai tài khoản đã đăng tin từ một máy trong 90 ngày và một tài khoản thứ ba gửi tin từ máy đó
- **THEN** tài khoản thứ ba không bị đánh dấu

#### Scenario: Tài khoản thứ tư

- **WHEN** ba tài khoản đã đăng tin từ một máy trong 90 ngày và một tài khoản thứ tư gửi tin từ máy đó
- **THEN** tài khoản thứ tư bị đánh dấu "nhiều tài khoản trên một máy" và vẫn đăng nhập bình thường

#### Scenario: Lượt đăng tin cũ hơn 90 ngày

- **WHEN** ba tài khoản từng đăng tin từ một máy nhưng lượt gần nhất của một trong số đó đã hơn 90 ngày, và
  một tài khoản mới gửi tin từ máy đó
- **THEN** tài khoản mới không bị đánh dấu

### Requirement: Đánh dấu tài khoản bắt đầu đăng tin sau khi máy có tài khoản bị khoá

Tài khoản đăng tin lần đầu trên một máy SAU KHI một tài khoản khác trên máy đó bị khoá SHALL bị đánh dấu
"dùng máy của tài khoản bị khoá" cho tới khi tài khoản kia được mở khoá. Tài khoản đã đăng tin trên máy từ
trước lúc khoá MUST NOT bị đánh dấu.

#### Scenario: Lập tài khoản mới ngay sau khi bị khoá

- **WHEN** tài khoản A bị khoá rồi tài khoản B đăng tin lần đầu trên cùng máy
- **THEN** B bị đánh dấu "dùng máy của tài khoản bị khoá"

#### Scenario: Người nhà đã đăng tin từ trước

- **WHEN** tài khoản B đã đăng tin trên máy trước khi tài khoản A trên cùng máy bị khoá
- **THEN** B không bị đánh dấu

#### Scenario: Tài khoản kia được mở khoá

- **WHEN** A được mở khoá
- **THEN** B hết bị đánh dấu "dùng máy của tài khoản bị khoá"

### Requirement: Gỡ đánh dấu qua hỗ trợ

Người bị đánh dấu SHALL liên hệ được hỗ trợ bằng mã tra cứu đi kèm câu báo chung của dấu hiệu gian lận (vd vừa
mua lại máy cũ); response cho chính người đó MUST NOT nhắc tới thiết bị (TK 8, TK 13). Master hoặc staff có việc
hỗ trợ nhập mã tra cứu SHALL thấy lý do cụ thể — loại đánh dấu, không có mã thiết bị — và gỡ được đánh dấu cho
tài khoản đó, kèm lý do.

#### Scenario: Hỗ trợ tra mã tra cứu

- **WHEN** staff có việc hỗ trợ nhập mã tra cứu mà một người bị đánh dấu "nhiều tài khoản trên một máy" gửi kèm
  yêu cầu
- **THEN** staff thấy tài khoản đó đang bị đánh dấu "nhiều tài khoản trên một máy", và response không chứa mã
  thiết bị

#### Scenario: Hỗ trợ xác nhận máy mua lại

- **WHEN** staff có việc hỗ trợ gỡ đánh dấu cho một tài khoản kèm lý do "máy mua lại"
- **THEN** tài khoản hết bị đánh dấu và lượt gửi tin kế tiếp không bị đánh dấu lại vì những tài khoản cũ
  trên máy

#### Scenario: Gỡ đánh dấu không có lý do

- **WHEN** staff có việc hỗ trợ gỡ đánh dấu cho một tài khoản mà bỏ trống lý do
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và tài khoản vẫn bị đánh dấu

#### Scenario: Mã tra cứu không có thật

- **WHEN** staff có việc hỗ trợ nhập một mã tra cứu không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Staff không có việc hỗ trợ

- **WHEN** staff chỉ được giao danh mục nhập một mã tra cứu
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Người bị đánh dấu xem tài khoản của mình

- **WHEN** người bị đánh dấu "nhiều tài khoản trên một máy" xem thông tin tài khoản của chính mình
- **THEN** response không nhắc tới thiết bị hay tên đánh dấu

### Requirement: Không lộ mã thiết bị

Dấu thiết bị SHALL chỉ dùng để chống gian lận. Người duyệt chỉ thấy câu "dùng chung thiết bị với tài khoản
X"; mã thiết bị MUST NOT xuất hiện trong bất kỳ response nào.

#### Scenario: Người duyệt xem tài khoản dùng chung máy

- **WHEN** staff xem thông tin một tài khoản dùng chung máy với tài khoản khác
- **THEN** response nêu tài khoản dùng chung máy và không chứa mã thiết bị

### Requirement: Máy đã bị xác nhận lạm dụng vẫn bị nhận ra sau khi cài lại app

Trên iPhone, nơi mã máy đổi khi gỡ và cài lại app, máy đã bị xác nhận lạm dụng SHALL vẫn bị nhận ra sau khi
cài lại app.

#### Scenario: Gỡ và cài lại app

- **WHEN** một iPhone đã bị đánh dấu lạm dụng gỡ app, cài lại và một tài khoản mới gửi tin từ máy đó
- **THEN** tài khoản mới bị đánh dấu như các tài khoản trước trên máy
