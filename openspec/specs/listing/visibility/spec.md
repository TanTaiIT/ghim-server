# listing/visibility Specification

## Purpose

Quyết một tin hiện ở đâu và cho ai: hai mức hiển thị với lý do hạn chế đặt và gỡ độc lập, cùng một luật duy
nhất cho câu hỏi "ai thấy một tin" (TK 15, TK 19).

## Requirements

### Requirement: Hai mức hiển thị

Tin đang hiển thị SHALL ở một trong hai mức. Đầy đủ: bảng tin, tìm kiếm, gợi ý, hồ sơ người bán. Hạn chế: chỉ
tìm kiếm có từ khoá, hồ sơ người bán và đường link trực tiếp — MUST NOT lên bảng tin hay vào gợi ý.

#### Scenario: Tin hạn chế

- **WHEN** một tin sàn chung đang hiển thị hạn chế
- **THEN** tin không có trên bảng tin hay trong gợi ý, nhưng có khi tìm bằng từ khoá khớp tiêu đề, có trên hồ
  sơ người bán, và mở bằng đường link trực tiếp nhận HTTP 200

#### Scenario: Xem theo danh mục không có từ khoá

- **WHEN** khách xem danh mục của tin hạn chế đó mà không nhập từ khoá
- **THEN** tin không có trong kết quả

#### Scenario: Tin đầy đủ

- **WHEN** một tin sàn chung đang hiển thị đầy đủ
- **THEN** tin có trên bảng tin sàn chung, trong tìm kiếm và trên hồ sơ người bán

### Requirement: Hạn chế khi còn ít nhất một lý do

Tin SHALL hiển thị hạn chế khi còn ít nhất một lý do hạn chế, và đầy đủ khi không còn lý do nào. Mỗi lý do —
"máy", "tài khoản mới" — đặt và gỡ độc lập; gỡ một lý do MUST NOT mở tin còn lý do khác.

#### Scenario: Gỡ một trong hai lý do

- **WHEN** một tin mang cả lý do "máy" lẫn "tài khoản mới" và người đăng lên T1
- **THEN** lý do "tài khoản mới" được gỡ còn tin vẫn hiển thị hạn chế vì lý do "máy"

#### Scenario: Gỡ lý do cuối cùng

- **WHEN** một tin chỉ còn lý do "máy" và người hậu kiểm cho tin đạt
- **THEN** tin hiển thị đầy đủ

### Requirement: Lý do "máy"

Lý do hạn chế "máy" SHALL chỉ do máy duyệt đặt; máy đặt khi nào thuộc phần chấm điểm. Lý do này chỉ được gỡ khi
người hậu kiểm cho tin đạt, hoặc khi lượt qua máy sau một lần sửa cho tin hiện đầy đủ (chốt 12/10/2026), và MUST
NOT tự gỡ theo thời gian.

#### Scenario: Chưa ai hậu kiểm

- **WHEN** một tin mang lý do "máy" đã hiển thị 10 ngày mà chưa có người hậu kiểm nào quyết
- **THEN** tin vẫn hiển thị hạn chế

#### Scenario: Sửa xong máy cho hiện đầy đủ

- **WHEN** người đăng ở mức T1 sửa một tin mang lý do "máy" và lượt qua máy sau khi sửa cho hiện đầy đủ
- **THEN** lý do "máy" được gỡ và tin hiển thị đầy đủ

### Requirement: Lý do "tài khoản mới"

Tin của người đăng đang ở mức T0 lên bảng ở nơi công khai — sàn chung hay nhóm công khai — SHALL mang lý do "tài
khoản mới", dù máy cho qua ở mức nào. Khi người đăng lên T1, lý do này SHALL được gỡ khỏi mọi tin của người đó (TK 27 cam
kết 15); tin thu hẹp về "chỉ thành viên" cũng SHALL được gỡ lý do này (chốt 12/10/2026).

#### Scenario: Tài khoản T0 đăng sàn chung

- **WHEN** máy cho qua đầy đủ một tin sàn chung của người đăng ở mức T0
- **THEN** tin hiển thị hạn chế với lý do "tài khoản mới"

#### Scenario: Tài khoản T0 đăng "nhóm công khai"

- **WHEN** máy cho qua một tin "nhóm công khai" của người đăng ở mức T0
- **THEN** tin mang lý do "tài khoản mới"

#### Scenario: Tài khoản T0 đăng "chỉ thành viên"

- **WHEN** máy cho qua đầy đủ một tin "chỉ thành viên" của người đăng ở mức T0
- **THEN** tin không mang lý do "tài khoản mới" và hiển thị đầy đủ

#### Scenario: Thu hẹp về "chỉ thành viên"

- **WHEN** người đăng ở mức T0 thu hẹp một tin sàn chung mang lý do "tài khoản mới" về "chỉ thành viên" của một
  nhóm mình là thành viên
- **THEN** lý do "tài khoản mới" được gỡ và tin hiển thị đầy đủ trong nhóm

#### Scenario: Lên T1

- **WHEN** người đăng có ba tin sàn chung chỉ mang lý do "tài khoản mới" lên T1
- **THEN** lý do được gỡ khỏi cả ba tin và cả ba hiển thị đầy đủ

### Requirement: Ai thấy một tin

Người khác người đăng SHALL thấy một tin chỉ khi: tin đang hiển thị, đã bán hoặc hết hạn; tin không bị tạm ẩn;
người xem nằm trong phạm vi nơi đăng; và bề mặt đang xem nằm trong mức hiển thị của tin. Ngoài các trường hợp
đó, tin MUST như không tồn tại với người xem. Người đăng luôn thấy tin của mình.

#### Scenario: Tin chờ duyệt

- **WHEN** khách mở đường link của một tin đang chờ duyệt
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Tin bị gỡ

- **WHEN** khách mở đường link của một tin bị gỡ
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Tin hết hạn

- **WHEN** khách mở đường link của một tin sàn chung đã hết hạn
- **THEN** response có HTTP 200 với trang chi tiết của tin

#### Scenario: Tin đã bán

- **WHEN** khách mở đường link của một tin sàn chung đã bán
- **THEN** response có HTTP 200 với trang chi tiết của tin

#### Scenario: Tin tạm ẩn

- **WHEN** khách mở đường link của một tin đang hiển thị nhưng đang tạm ẩn
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Người đăng xem tin của mình

- **WHEN** người đăng mở tin đang chờ duyệt của chính mình
- **THEN** người đăng thấy tin cùng trạng thái của nó

### Requirement: Phạm vi theo nơi đăng

Tin "chỉ thành viên" SHALL chỉ hiện với thành viên của nhóm. Tin "nhóm công khai" hiện với mọi người nhưng chỉ
nằm trong bảng tin của nhóm. Tin sàn chung hiện với mọi người, trên bảng tin cả nước.

#### Scenario: Khách mở tin "chỉ thành viên"

- **WHEN** khách hoặc một người không phải thành viên mở đường link của tin "chỉ thành viên"
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Thành viên mở tin "chỉ thành viên"

- **WHEN** thành viên của nhóm mở tin "chỉ thành viên" đang hiển thị đầy đủ của nhóm
- **THEN** response có HTTP 200 và tin có trên bảng tin của nhóm

#### Scenario: Tin "nhóm công khai"

- **WHEN** khách xem một tin "nhóm công khai" đang hiển thị đầy đủ
- **THEN** khách mở được tin và thấy nó trên bảng tin của nhóm, nhưng tin không có trên bảng tin sàn chung

### Requirement: Tìm kiếm và gợi ý

Tìm kiếm chung và gợi ý SHALL chỉ gồm tin sàn chung đang hiển thị trong phạm vi người xem — gợi ý chỉ lấy mức
đầy đủ. Tin "nhóm công khai" chỉ tìm được trong nhóm của nó. Tin đã bán và hết hạn MUST NOT có trong tìm kiếm hay
gợi ý, chỉ mở được bằng đường link (TK 12, TK 15, chốt 12/10/2026).

#### Scenario: Tìm kiếm chung gặp tin "nhóm công khai"

- **WHEN** khách tìm bằng từ khoá khớp tiêu đề một tin "nhóm công khai" đang hiển thị đầy đủ
- **THEN** tin không có trong kết quả tìm kiếm chung, nhưng có khi tìm trong nhóm của nó

#### Scenario: Tin đã bán

- **WHEN** khách tìm bằng từ khoá khớp tiêu đề một tin sàn chung đã bán
- **THEN** tin không có trong kết quả, còn mở bằng đường link vẫn nhận HTTP 200

### Requirement: Bảng tin chỉ lấy tin đang hiển thị mức đầy đủ

Bảng tin — của sàn chung cũng như của từng nhóm — SHALL chỉ gồm tin đang hiển thị, mức đầy đủ, không tạm ẩn,
nằm trong phạm vi của người xem. Tin đã bán và tin hết hạn MUST NOT có trên bảng tin.

#### Scenario: Tin hết hạn rời bảng tin

- **WHEN** một tin sàn chung đầy đủ chuyển sang hết hạn
- **THEN** tin không còn trên bảng tin sàn chung

#### Scenario: Tin đã bán rời bảng tin

- **WHEN** người đăng đánh dấu đã bán một tin sàn chung đầy đủ
- **THEN** tin không còn trên bảng tin sàn chung
