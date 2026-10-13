## Purpose

Cho người đăng luôn biết tin của mình đang ở đâu: lỗi tự sửa được thì nói rõ cách sửa; dấu hiệu gian lận thì
một câu chung ba phần — lý do ở mức nhóm, thời gian chờ ước tính, nút liên hệ hỗ trợ kèm mã tra cứu — để biết
vì sao và tới bao giờ mà không học được cách lách (TK 4 nguyên tắc 8, TK 8, TK 13).

## ADDED Requirements

### Requirement: Tin bị giữ luôn báo đang chờ người duyệt

Mọi tin bị máy giữ mà không trúng dấu hiệu gian lận nào SHALL cho người đăng thấy câu "Tin đang chờ người
duyệt, thường trong 24 giờ" (hạn 24 giờ là giá trị khởi đầu), dù tin bị giữ vì lý do gì khác. Tin có trúng dấu
hiệu gian lận thì thấy câu chung ba phần thay cho câu này.

#### Scenario: Tin bị giữ vì dải Cao

- **WHEN** tin của người đăng bị giữ vì điểm rủi ro ở dải Cao, chỉ từ các dấu hiệu không phải gian lận (giá
  bất thường, chữ như gõ bừa, liên hệ ngoài sàn)
- **THEN** người đăng xem tin của mình thấy câu "Tin đang chờ người duyệt, thường trong 24 giờ"

#### Scenario: Tin bị giữ vì danh mục luôn duyệt tay

- **WHEN** tin bị giữ chỉ vì danh mục bật luôn duyệt tay
- **THEN** người đăng thấy câu "Tin đang chờ người duyệt, thường trong 24 giờ"

#### Scenario: Tin bị giữ vì lỗi của máy

- **WHEN** tin của người đăng bị giữ vì việc kiểm ảnh báo lỗi
- **THEN** người đăng thấy câu "Tin đang chờ người duyệt, thường trong 24 giờ"

### Requirement: Lỗi tự sửa được thì giải thích cách sửa

Khi máy giữ tin hoặc cho hiện hạn chế, mỗi lỗi tự sửa được mà tin trúng — giá lệch xa mức thường thấy, giá
vượt trần, sai danh mục, số điện thoại hay liên hệ ngoài sàn trong mô tả — SHALL được nêu bằng một câu dễ
hiểu, kèm việc người đăng làm được ngay.

#### Scenario: Giá bất thường

- **WHEN** tin bị giữ và có trúng "giá bất thường"
- **THEN** người đăng thấy câu như "Giá của tin lệch xa mức thường thấy trong danh mục này. Kiểm tra lại đơn
  vị (đồng) và số 0."

#### Scenario: Số Zalo trong mô tả

- **WHEN** tin của tài khoản T0 bị giữ vì "tài khoản mới" cộng "liên hệ ngoài sàn"
- **THEN** người đăng được nhắc thêm số điện thoại vào hồ sơ thay vì ghi vào mô tả

#### Scenario: Giá vượt trần

- **WHEN** tin bị giữ vì giá vượt trần danh mục
- **THEN** người đăng thấy câu nói giá cao hơn mức tối đa của danh mục, kèm gợi ý kiểm tra lại giá

#### Scenario: Sai danh mục

- **WHEN** tin bị giữ và có trúng "sai danh mục"
- **THEN** người đăng thấy câu nói tin có thể đang sai danh mục, kèm gợi ý kiểm tra lại danh mục đã chọn

### Requirement: Dấu hiệu gian lận dùng một câu chung ba phần

Tin bị máy giữ hay bị rút về chờ duyệt mà có trúng dấu hiệu gian lận — cụm từ cấm (cả hai mức), ảnh trùng,
thiết bị (đánh dấu theo thiết bị, trùng thiết bị với tài khoản bị khoá), đăng dồn — SHALL cho người đăng thấy
một câu chung ba phần: lý do ở mức nhóm "Tin cần kiểm tra an toàn thêm", thời gian chờ ước tính (thường trong
24 giờ, giá trị khởi đầu), và nút liên hệ hỗ trợ kèm mã tra cứu (TK 4 nguyên tắc 8, TK 8, TK 13, cam kết 14).

#### Scenario: Tin bị giữ chỉ vì cụm từ cấm

- **WHEN** tin không trúng gì ngoài cụm "bán súng" mức chắc và bị giữ
- **THEN** người đăng thấy câu "Tin cần kiểm tra an toàn thêm", thời gian chờ ước tính và nút liên hệ hỗ trợ
  kèm mã tra cứu, không thấy cụm nào hay luật nào đã trúng

#### Scenario: Tài khoản thứ tư trên một máy

- **WHEN** tin của tài khoản bị đánh dấu "nhiều tài khoản trên một máy" bị giữ
- **THEN** người đăng thấy đúng câu chung ba phần như mọi dấu hiệu gian lận khác, kèm mã tra cứu

#### Scenario: Tin bị rút về khi bật cụm mới

- **WHEN** tin đang hiện bị máy rút về chờ duyệt vì master vừa bật thật một cụm mức chắc
- **THEN** người đăng thấy câu chung ba phần kèm mã tra cứu

### Requirement: Không nêu dấu hiệu gian lận

Với dấu hiệu gian lận, mọi response cho người đăng — kể cả câu chung và mã tra cứu — MUST NOT nêu dấu hiệu,
luật, cụm từ hay ảnh nào đã trúng, và MUST NOT nhắc tới thiết bị. Mã tra cứu MUST NOT cho suy ra được tín hiệu
nào: hai tin bị giữ vì hai tín hiệu khác nhau SHALL nhận cùng một câu, chỉ khác mã (TK 8, TK 13).

#### Scenario: Tin bị giữ vì đăng dồn

- **WHEN** tin của tài khoản T0 bị giữ vì "đăng dồn" cộng "tài khoản mới"
- **THEN** response cho người đăng không nhắc tới số lượt gửi hay dấu hiệu "đăng dồn"

#### Scenario: Tin bị giữ vì ảnh trùng

- **WHEN** tin bị giữ vì một ảnh trùng với tin của tài khoản khác
- **THEN** response cho người đăng không nêu ảnh nào bị trùng hay trùng với ai

#### Scenario: Dùng máy của tài khoản bị khoá

- **WHEN** tin của tài khoản bị đánh dấu "dùng máy của tài khoản bị khoá" bị giữ
- **THEN** response cho người đăng không nhắc tới thiết bị, máy hay tài khoản nào khác

#### Scenario: Hai tín hiệu khác nhau

- **WHEN** một tin bị giữ vì cụm từ cấm mức chắc và một tin khác bị giữ vì tài khoản bị đánh dấu theo thiết
  bị
- **THEN** hai người đăng thấy cùng một câu chung, chỉ khác mã tra cứu

### Requirement: Hỗ trợ nhập mã tra cứu thì thấy lý do cụ thể

Master hoặc staff có việc hỗ trợ người dùng SHALL nhập được mã tra cứu và thấy lý do cụ thể khiến tin bị giữ —
dấu hiệu, luật, cụm từ hay ảnh đã trúng, loại đánh dấu theo thiết bị — để gỡ khi đúng là nhầm (vd gỡ đánh dấu
cho người vừa mua lại máy cũ, theo `identity/device-registry`). Người khác, kể cả người đăng, MUST NOT tra
được. Mã thiết bị MUST NOT hiện (TK 8, TK 13).

#### Scenario: Staff có việc hỗ trợ tra mã

- **WHEN** staff có việc hỗ trợ người dùng nhập mã tra cứu của một tin bị giữ vì tài khoản bị đánh dấu "nhiều
  tài khoản trên một máy"
- **THEN** response có HTTP 200, nêu lý do "nhiều tài khoản trên một máy" và không chứa mã thiết bị

#### Scenario: Gỡ khi đúng là nhầm

- **WHEN** hỗ trợ tra mã, xác nhận người đăng vừa mua lại máy cũ và gỡ đánh dấu kèm lý do "máy mua lại"
- **THEN** tài khoản hết bị đánh dấu và lượt gửi tin kế tiếp được chấm như mọi tài khoản khác

#### Scenario: Staff không có việc hỗ trợ

- **WHEN** staff chỉ được giao danh mục Điện thoại nhập một mã tra cứu
- **THEN** response có HTTP 403 `FORBIDDEN` và không nêu lý do nào

#### Scenario: Người đăng tự tra mã của mình

- **WHEN** người đăng không mang quyền staff nhập mã tra cứu của chính tin mình
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Mã không tồn tại

- **WHEN** staff có việc hỗ trợ người dùng nhập một mã tra cứu không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Dấu hiệu khác chỉ nhận câu chờ

Dấu hiệu không tự sửa được và không phải gian lận — chữ như gõ bừa, giá 0 ở danh mục giá trị cao, trùng tin của
chính mình, bị giữ nhiều, tài khoản mới, danh mục rủi ro cao — MUST NOT được giải thích; người đăng chỉ thấy câu
"Tin đang chờ người duyệt, thường trong 24 giờ" (chốt 12/10/2026).

#### Scenario: Tin bị giữ vì gõ bừa

- **WHEN** tin bị giữ ở dải Cao vì "chữ như gõ bừa" cộng "tài khoản mới" và "giá 0 ở danh mục giá trị cao"
- **THEN** người đăng thấy câu "Tin đang chờ người duyệt, thường trong 24 giờ" và không câu nào nêu dấu hiệu

### Requirement: Vừa lỗi tự sửa được vừa dấu hiệu gian lận

Tin vừa trúng lỗi tự sửa được vừa trúng dấu hiệu gian lận SHALL cho người đăng thấy câu giải thích của lỗi tự sửa
được kèm câu chung ba phần, và MUST NOT nêu dấu hiệu gian lận nào (chốt 12/10/2026).

#### Scenario: Giá bất thường cộng cụm từ cấm

- **WHEN** tin bị giữ vì cụm từ cấm mức chắc và có trúng "giá bất thường"
- **THEN** người đăng thấy câu về giá lệch xa mức thường thấy và câu chung ba phần kèm mã tra cứu, không thấy cụm
  nào đã trúng

### Requirement: Mỗi lần giữ một mã tra cứu

Mỗi lần máy giữ hay rút tin về vì dấu hiệu gian lận SHALL có một mã tra cứu riêng, tra được bao lâu kết quả máy còn
lưu. Thời gian chờ ước tính SHALL là hạn xử của hàng máy giữ (24 giờ, giá trị khởi đầu). Hỗ trợ chỉ gỡ được đánh
dấu theo thiết bị; cụm từ hay ảnh trùng do người duyệt quyết (chốt 12/10/2026).

#### Scenario: Một tin bị giữ hai lần

- **WHEN** một tin bị giữ vì cụm từ cấm, người đăng sửa, và lượt qua máy sau lại bị giữ vì cụm từ cấm
- **THEN** hai lần giữ có hai mã tra cứu khác nhau
