# identity/device-registry Specification

## Purpose

Nhận ra các tài khoản đăng tin từ cùng một chiếc máy — dấu hiệu thay cho SMS để chặn một người lập nhiều
tài khoản bằng nhiều email (TK 8). Capability này chỉ ghi và đánh dấu; hệ quả lên tin đăng nằm ở máy duyệt.

## Requirements

### Requirement: Ghi dấu thiết bị khi đăng tin

Mỗi lượt gửi tin SHALL ghi lại dấu thiết bị của máy gửi, gắn với tài khoản gửi. Đăng nhập hay xem tin MUST
NOT được tính vào số tài khoản đăng tin của máy — điện thoại cũ qua tay nhiều chủ, chỉ việc đăng tin mới nói lên ai
đang dùng máy để đăng. Dấu đăng nhập (requirement "Ghi dấu thiết bị khi đăng nhập") chỉ phục vụ luật xung đột lợi ích
và luật người hỏi mua, MUST NOT nuôi đánh dấu nào của capability này.

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

### Requirement: Chỗ trên một máy xếp theo lần đăng tin đầu tiên

Thứ tự ba chỗ trên một máy SHALL tính theo lần đăng tin đầu tiên của mỗi tài khoản trên máy đó: tài khoản
cũ quay lại đăng tin vẫn giữ chỗ của mình, tài khoản đến sau mới là bên nằm ngoài ba chỗ. Đánh dấu SHALL
được tính lại ở mỗi lượt gửi tin.

#### Scenario: Tài khoản cũ quay lại đăng tin

- **WHEN** A, B, C rồi D lần lượt đăng tin lần đầu từ một máy trong 90 ngày, D đang bị đánh dấu, và A gửi
  tin tiếp từ máy đó
- **THEN** A không bị đánh dấu và D vẫn bị đánh dấu

#### Scenario: Tài khoản thứ tư hết bị đánh dấu khi một chỗ trống ra

- **WHEN** D đang bị đánh dấu vì A, B, C đứng trước, lượt đăng tin gần nhất của A đã quá 90 ngày, và D gửi
  tin tiếp từ máy đó
- **THEN** D hết bị đánh dấu "nhiều tài khoản trên một máy"

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

Mỗi đánh dấu SHALL có một mã tra cứu riêng, cấp ngay lúc đánh dấu; mã MUST NOT mang thông tin về loại đánh
dấu, tài khoản hay thiết bị. Người bị đánh dấu SHALL liên hệ được hỗ trợ bằng mã tra cứu đi kèm câu báo chung
của dấu hiệu gian lận (vd vừa mua lại máy cũ); response cho chính người đó MUST NOT nhắc tới thiết bị (TK 8,
TK 13). Master hoặc staff có việc hỗ trợ nhập mã tra cứu SHALL thấy lý do cụ thể — loại đánh dấu, không có mã
thiết bị — và gỡ được đánh dấu cho tài khoản đó, kèm lý do.

#### Scenario: Mỗi đánh dấu một mã

- **WHEN** một tài khoản bị đánh dấu "nhiều tài khoản trên một máy" rồi bị đánh dấu thêm "dùng máy của tài
  khoản bị khoá"
- **THEN** hai đánh dấu có hai mã tra cứu khác nhau, và nhập mã nào thì staff có việc hỗ trợ chỉ thấy đánh
  dấu đó

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

### Requirement: Staff không gỡ đánh dấu của chính mình

Staff được giao việc hỗ trợ MUST NOT gỡ đánh dấu đặt trên chính tài khoản của mình; chỉ master được (TK 4, nguyên tắc
không tự xử việc của mình).

#### Scenario: Staff gỡ đánh dấu của chính mình

- **WHEN** staff được giao việc hỗ trợ gỡ đánh dấu "nhiều tài khoản trên một máy" đặt trên tài khoản của chính mình
- **THEN** response có HTTP 403 `FORBIDDEN` và đánh dấu vẫn còn

### Requirement: Đánh dấu tài khoản bắt đầu đăng tin sau khi máy có tài khoản nhận gậy

Tài khoản đăng tin lần đầu trên một máy SAU KHI một tài khoản khác đã đăng tin trên máy đó nhận gậy SHALL bị
đánh dấu "dùng máy của tài khoản có gậy" tới khi gậy đó hết hiệu lực — hết hạn hoặc bị huỷ. Tài khoản đã đăng
tin trên máy từ trước lúc gậy được ra MUST NOT bị đánh dấu.

#### Scenario: Lập tài khoản mới ngay sau khi nhận gậy

- **WHEN** tài khoản A nhận gậy thường rồi tài khoản B đăng tin lần đầu trên cùng máy
- **THEN** B bị đánh dấu "dùng máy của tài khoản có gậy"

#### Scenario: Người nhà đã đăng tin từ trước

- **WHEN** tài khoản B đã đăng tin trên máy trước khi tài khoản A trên cùng máy nhận gậy
- **THEN** B không bị đánh dấu

#### Scenario: Gậy hết hạn

- **WHEN** gậy của A hết hạn
- **THEN** B hết bị đánh dấu "dùng máy của tài khoản có gậy"

#### Scenario: Gậy bị huỷ

- **WHEN** gậy của A bị huỷ vì khiếu nại thắng
- **THEN** B hết bị đánh dấu "dùng máy của tài khoản có gậy"

#### Scenario: Gậy nghiêm trọng được hạ thành gậy nặng

- **WHEN** A nhận gậy nghiêm trọng, B bắt đầu đăng tin trên cùng máy, rồi master hạ gậy của A thành gậy nặng và
  mở khoá A
- **THEN** B vẫn bị đánh dấu "dùng máy của tài khoản có gậy" tới khi gậy nặng đó hết hạn

### Requirement: Ghi dấu thiết bị khi đăng nhập

Mỗi lượt đăng nhập thành công từ app có gửi mã máy SHALL ghi lại dấu thiết bị của máy đó, gắn với tài khoản, kèm lần
đầu và lần gần nhất. Lượt không gửi mã máy hay bị từ chối MUST NOT ghi gì. Dấu đăng nhập SHALL chỉ dùng để nhận ra tài
khoản dùng chung máy (TK 16, TK 20) và SHALL bị xoá theo cùng hạn lưu với dấu đăng tin.

#### Scenario: Đăng nhập có mã máy

- **WHEN** một tài khoản đăng nhập thành công từ app kèm mã máy
- **THEN** máy đó được ghi nhận là đã có tài khoản này đăng nhập, kèm thời điểm, và không đánh dấu nào được đặt

#### Scenario: Đăng nhập lại cùng máy

- **WHEN** tài khoản đó đăng nhập lần nữa từ cùng máy
- **THEN** dấu giữ lần đầu, cập nhật lần gần nhất, không thêm dòng mới

#### Scenario: Đăng nhập không có mã máy

- **WHEN** một tài khoản đăng nhập mà app không gửi mã máy
- **THEN** không dấu thiết bị nào được ghi

#### Scenario: Sai mật khẩu

- **WHEN** một lượt đăng nhập kèm mã máy bị từ chối vì sai mật khẩu
- **THEN** không dấu thiết bị nào được ghi

#### Scenario: Quá hạn lưu

- **WHEN** dấu đăng nhập có lần gần nhất cũ hơn hạn lưu dữ liệu thiết bị
- **THEN** job hạn lưu xoá dấu đó
