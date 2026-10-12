## Purpose

Cho master giữ danh sách cụm từ cấm hai mức cùng cách so khớp chống lách — đủ chặt để bắt "b á n s ú n g" mà
không giữ nhầm hàng loạt người bán bình thường (TK 13, cam kết 16).

## ADDED Requirements

### Requirement: Hai mức cụm từ cấm

Mỗi cụm từ cấm SHALL thuộc một trong hai mức. Tin có tiêu đề hoặc mô tả trúng cụm mức chắc đang bật SHALL
tính là dính cổng cứng. Tin trúng cụm mức mơ hồ đang bật SHALL trúng dấu hiệu "cụm từ cấm mức mơ hồ", 25
điểm (giá trị khởi đầu), và MUST NOT tính là dính cổng cứng.

#### Scenario: Trúng cụm mức chắc

- **WHEN** "bán súng" là cụm mức chắc đang bật và tiêu đề của tin là "Bán súng hơi"
- **THEN** tin dính cổng cứng "cụm từ cấm" và kết quả máy là giữ cho người

#### Scenario: Trúng cụm mức mơ hồ

- **WHEN** một cụm mức mơ hồ đang bật xuất hiện trong mô tả của một tin không trúng gì khác
- **THEN** tin được cộng 25 điểm và không dính cổng cứng

### Requirement: Chỉ nhận cụm từ hai chữ trở lên

Chỉ master SHALL thêm được cụm từ cấm, kèm mức của cụm. Cụm MUST có từ hai chữ trở lên — từ đơn như "súng" bỏ
dấu thành "sung", trùng "bổ sung", "quả sung", sẽ giữ nhầm hàng loạt người bán.

#### Scenario: Thêm cụm hai chữ

- **WHEN** master thêm cụm "bán súng" ở mức chắc
- **THEN** response có HTTP 201 và cụm ở chế độ chạy thử

#### Scenario: Thêm từ đơn

- **WHEN** master thêm cụm "súng"
- **THEN** response có HTTP 400 `BANNED_PHRASE_TOO_SHORT` và không cụm nào được thêm

#### Scenario: Bỏ trống cụm

- **WHEN** master thêm một cụm rỗng
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Staff thêm cụm

- **WHEN** một staff thêm cụm từ cấm
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: So khớp theo ranh giới chữ, không phân biệt dấu

Cụm SHALL được so theo ranh giới chữ, không phân biệt hoa thường và dấu; chữ cái bị tách rời bằng khoảng
trắng SHALL được ghép lại trước khi so. Cụm MUST NOT trúng khi chỉ khớp một phần của một chữ.

#### Scenario: Viết không dấu

- **WHEN** "bán súng" là cụm đang bật và mô tả ghi "ban sung gia re"
- **THEN** tin trúng cụm "bán súng"

#### Scenario: Chữ cái tách rời

- **WHEN** "bán súng" là cụm đang bật và mô tả ghi "b á n s ú n g"
- **THEN** tin trúng cụm "bán súng"

#### Scenario: Chỉ khớp một phần chữ

- **WHEN** "cần sa" là cụm đang bật và mô tả ghi "cần sang nhượng gấp"
- **THEN** tin không trúng cụm "cần sa"

### Requirement: Ngoại lệ của từng cụm

Mỗi cụm SHALL có danh sách ngoại lệ do master giữ. Chỗ trúng nằm trọn trong một ngoại lệ MUST NOT tính là
trúng cụm; tin vẫn trúng nếu cụm còn xuất hiện ở chỗ khác.

#### Scenario: Chỉ có ngoại lệ

- **WHEN** cụm "bán súng" có ngoại lệ "bán súng nước" và mô tả ghi "bán súng nước cho bé"
- **THEN** tin không trúng cụm "bán súng"

#### Scenario: Có cả ngoại lệ lẫn cụm

- **WHEN** cụm "bán súng" có ngoại lệ "bán súng nước" và mô tả ghi "bán súng nước, bán súng hơi"
- **THEN** tin trúng cụm "bán súng"

#### Scenario: Staff thêm ngoại lệ

- **WHEN** một staff thêm ngoại lệ cho một cụm
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Cụm mới chạy thử trước khi bật

Cụm mới SHALL ở chế độ chạy thử 7 ngày (giá trị khởi đầu) rồi master mới bật thật. Cụm chạy thử vẫn được so
và ghi vào kết quả máy, nhưng MUST NOT đổi điểm hay kết quả.

#### Scenario: Tin trúng cụm đang chạy thử

- **WHEN** "bán súng" là cụm mức chắc đang chạy thử và tài khoản T2 gửi tin "Bán súng hơi" không trúng gì
  khác
- **THEN** kết quả máy là hiện đầy đủ, và kết quả máy ghi lại lượt trúng cụm đang chạy thử

#### Scenario: Sau khi master bật thật

- **WHEN** master bật thật cụm "bán súng" mức chắc rồi một tin "Bán súng hơi" được gửi
- **THEN** tin dính cổng cứng và kết quả máy là giữ cho người

#### Scenario: Bật một cụm không tồn tại

- **WHEN** master bật một mã cụm không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Staff bật cụm

- **WHEN** một staff bật thật một cụm đang chạy thử
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Bật thật cụm mức chắc thì quét lại tin đang hiện

Khi master bật thật một cụm mức chắc, hệ thống SHALL quét lại mọi tin đang hiển thị. Tin chứa cụm đó, ngoài
ngoại lệ, SHALL được máy rút về chờ duyệt — đi mũi tên Đang hiển thị → Chờ duyệt (TK 18) — và không còn hiện
với người khác. Máy MUST NOT từ chối tin, ra gậy hay hạ mức tin cậy vì lượt rút về này (cam kết 5, 16).

#### Scenario: Tin đang hiện chứa cụm vừa bật

- **WHEN** một tin đang hiện đầy đủ có mô tả chứa "bán súng" và master bật thật cụm "bán súng" mức chắc
- **THEN** tin chuyển từ đang hiển thị sang chờ duyệt, không bị từ chối, người đăng không nhận gậy nào, và
  tin không còn hiện với người khác

#### Scenario: Tin đang hiện không chứa cụm

- **WHEN** master bật thật cụm "bán súng" và một tin đang hiện không chứa cụm này
- **THEN** tin giữ nguyên trạng thái và mức hiển thị

#### Scenario: Tin chỉ chứa ngoại lệ

- **WHEN** master bật thật cụm "bán súng" có ngoại lệ "bán súng nước" và một tin đang hiện chỉ ghi "bán súng
  nước"
- **THEN** tin giữ nguyên trạng thái và mức hiển thị

### Requirement: Tắt một cụm

Master SHALL tắt được một cụm; cụm tắt không còn được so ở các lượt qua máy sau. Tin đã bị giữ vì cụm đó MUST
NOT tự hiện khi cụm bị tắt (TK nguyên tắc 2).

#### Scenario: Gửi tin sau khi cụm bị tắt

- **WHEN** master tắt cụm "bán súng" rồi tài khoản T2 gửi tin "Bán súng hơi" không trúng gì khác
- **THEN** kết quả máy là hiện đầy đủ

#### Scenario: Tin đang chờ vì cụm vừa bị tắt

- **WHEN** một tin đang chờ người duyệt vì cụm "bán súng" và master tắt cụm này
- **THEN** tin vẫn chờ người duyệt, không tự hiện

### Requirement: Bật thật cụm mức mơ hồ không quét lại

Bật thật một cụm mức mơ hồ SHALL chỉ có tác dụng từ lượt qua máy kế tiếp; tin đang hiển thị MUST NOT bị quét lại
hay rút về vì cụm đó (chốt 12/10/2026).

#### Scenario: Tin đang hiện chứa cụm mơ hồ vừa bật

- **WHEN** master bật thật một cụm mức mơ hồ mà một tin đang hiện đầy đủ có chứa
- **THEN** tin giữ nguyên trạng thái và mức hiển thị

### Requirement: Quét lại chỉ rút tin đang hiển thị

Lượt quét khi bật thật cụm mức chắc SHALL chỉ xét tin đang hiển thị; tin đã bán, hết hạn MUST NOT bị đổi. Tin bị
rút về chờ duyệt vẫn trôi ngày hiển thị như tin chờ duyệt sau khi sửa (chốt 12/10/2026).

#### Scenario: Tin đã bán chứa cụm vừa bật

- **WHEN** master bật thật cụm "bán súng" mức chắc và một tin đã bán có mô tả chứa "bán súng"
- **THEN** tin vẫn ở trạng thái đã bán và mở bằng đường link vẫn nhận HTTP 200

#### Scenario: Tin bị rút về rồi được cho đạt

- **WHEN** một tin hết hạn ngày 31 bị rút về chờ duyệt ngày 20 và người duyệt cho đạt ngày 22
- **THEN** tin hiện lại và vẫn hết hạn ngày 31

### Requirement: Bật thật trước khi đủ ngày chạy thử

Master SHALL bật thật được một cụm trước khi đủ 7 ngày chạy thử chỉ khi ghi kèm lý do; lần bật đó vào nhật ký vận
hành (chốt 12/10/2026).

#### Scenario: Bật sớm kèm lý do

- **WHEN** master bật thật một cụm mới chạy thử được 2 ngày, ghi lý do "đợt lừa đảo mới"
- **THEN** cụm được bật thật và nhật ký vận hành có lần bật kèm lý do

#### Scenario: Bật sớm không lý do

- **WHEN** master bật thật một cụm mới chạy thử được 2 ngày mà không ghi lý do
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và cụm vẫn chạy thử

### Requirement: Trúng nhiều cụm mơ hồ cộng điểm một lần

Tin trúng nhiều cụm mức mơ hồ SHALL chỉ được cộng điểm của dấu hiệu "cụm từ cấm mức mơ hồ" một lần; kết quả máy vẫn
ghi mọi cụm đã trúng (chốt 12/10/2026).

#### Scenario: Hai cụm mơ hồ

- **WHEN** mô tả của một tin chứa hai cụm mức mơ hồ khác nhau đang bật, không trúng gì khác
- **THEN** điểm rủi ro là 25 và kết quả máy ghi cả hai cụm
