# screening/hard-gates Specification

## Purpose

Định nghĩa những trường hợp máy luôn giữ tin cho người mà không cần chấm điểm, và chặn việc dò cổng cứng bằng
thời gian chờ thay vì phạt (TK 8, TK 11, TK 13).

## Requirements

### Requirement: Tin dính cổng cứng luôn giữ cho người

Tin dính ít nhất một cổng cứng — cụm từ cấm mức chắc, ảnh trùng với tin của tài khoản khác, giá vượt trần danh
mục — SHALL bị giữ cho người, bất kể điểm rủi ro, dải và mức tin cậy. Máy không kiểm nội dung ảnh nên không có cổng
"ảnh nhạy cảm" (chốt 24/10/2026).

#### Scenario: Tài khoản T3 dùng ảnh của người khác

- **WHEN** tài khoản T3 gửi một tin không trúng dấu hiệu rủi ro nào nhưng có một ảnh gần như giống hệt ảnh trong
  tin của tài khoản khác
- **THEN** kết quả máy là giữ cho người

#### Scenario: Cụm từ cấm mức chắc trong tin nhóm

- **WHEN** tài khoản T2 gửi vào nhóm, ở mức "chỉ thành viên", một tin chứa cụm từ cấm mức chắc
- **THEN** kết quả máy là giữ cho người

### Requirement: Giá vượt trần danh mục

Giá cao hơn trần giá của danh mục tin đã chọn SHALL tính là dính cổng cứng. Giá bằng trần MUST NOT tính.

#### Scenario: Giá trên trần

- **WHEN** danh mục Điện thoại có trần giá 60 triệu và một tin trong đó đặt giá 65 triệu
- **THEN** tin dính cổng cứng "giá vượt trần" và kết quả máy là giữ cho người

#### Scenario: Giá đúng bằng trần

- **WHEN** danh mục Điện thoại có trần giá 60 triệu và một tin trong đó đặt giá 60 triệu
- **THEN** tin không dính cổng cứng "giá vượt trần"

### Requirement: Danh mục luôn duyệt tay luôn giữ cho người

Mọi tin thuộc danh mục đang bật "luôn duyệt tay" SHALL bị giữ cho người, ở mọi mức tin cậy, mọi dải và mọi
nơi đăng, kể cả nhóm riêng tư (TK 11, TK 13). Danh mục không bật "luôn duyệt tay" MUST NOT giữ tin chỉ vì
danh mục, kể cả khi danh mục có mức rủi ro cao — mức cao chỉ cộng điểm (`screening/risk-scoring`).

#### Scenario: Tài khoản T3 đăng thú cưng

- **WHEN** danh mục Thú cưng bật luôn duyệt tay và tài khoản T3 gửi vào đó một tin không trúng dấu hiệu nào
- **THEN** kết quả máy là giữ cho người

#### Scenario: Tin "chỉ thành viên" trong danh mục luôn duyệt tay

- **WHEN** tài khoản T2 gửi một tin danh mục Thú cưng vào nhóm riêng tư ở mức "chỉ thành viên"
- **THEN** kết quả máy là giữ cho người

#### Scenario: Danh mục rủi ro cao không bật luôn duyệt tay

- **WHEN** danh mục Đồng hồ có mức rủi ro cao, không bật luôn duyệt tay, và tài khoản T2 gửi vào đó một tin
  không trúng dấu hiệu nào khác
- **THEN** tin không bị giữ vì danh mục và kết quả máy là hiện đầy đủ

### Requirement: Tài khoản bị đánh dấu theo thiết bị luôn giữ cho người

Mọi tin của tài khoản đang mang BẤT KỲ đánh dấu nào của `identity/device-registry` (vd "nhiều tài khoản
trên một máy", "dùng máy của tài khoản bị khoá") SHALL bị giữ cho người. Đánh dấu MUST NOT chặn gửi tin. Hết bị đánh dấu thì lượt qua
máy sau SHALL được chấm như mọi tài khoản khác (TK 8, cam kết 14).

#### Scenario: Tài khoản thứ tư trên một máy

- **WHEN** ba tài khoản khác đã đăng tin từ một máy trong 90 ngày và tài khoản thứ tư gửi tin đầu tiên từ
  máy đó
- **THEN** tin được nhận, không bị từ chối, kết quả máy là giữ cho người, và câu báo cho người đăng là câu
  chung của dấu hiệu gian lận, không nhắc tới thiết bị

#### Scenario: Tài khoản bị đánh dấu gửi tin không trúng dấu hiệu nào

- **WHEN** tài khoản đang bị đánh dấu "nhiều tài khoản trên một máy" gửi vào nhóm, ở mức "chỉ thành viên",
  một tin không trúng dấu hiệu nào
- **THEN** kết quả máy là giữ cho người

#### Scenario: Dùng máy của tài khoản bị khoá

- **WHEN** tài khoản đang bị đánh dấu "dùng máy của tài khoản bị khoá" gửi tin
- **THEN** kết quả máy là giữ cho người

#### Scenario: Hỗ trợ đã gỡ đánh dấu

- **WHEN** hỗ trợ gỡ đánh dấu cho một tài khoản T2, rồi tài khoản đó gửi một tin không trúng dấu hiệu nào
- **THEN** kết quả máy là hiện đầy đủ

#### Scenario: Tin đang chờ lúc gỡ đánh dấu

- **WHEN** hỗ trợ gỡ đánh dấu cho một tài khoản đang có một tin chờ người duyệt vì đánh dấu đó
- **THEN** tin vẫn chờ người duyệt, không được chấm lại (chốt 12/10/2026)

### Requirement: Dò cổng cứng thì vào thời gian chờ

Tài khoản có 3 lượt qua máy dính cổng cứng trong 24 giờ (giá trị khởi đầu) SHALL vào thời gian chờ 24 giờ
(giá trị khởi đầu), tính từ lượt thứ ba. Thời gian chờ không phải gậy: MUST NOT ghi gậy, MUST NOT đổi mức
tin cậy.

#### Scenario: Lượt dính cổng cứng thứ ba trong 24 giờ

- **WHEN** tài khoản T2 đã có 2 lượt dính cổng cứng trong 20 giờ qua và gửi tin thứ ba dính cổng cứng
- **THEN** tin thứ ba bị giữ cho người, tài khoản vào thời gian chờ 24 giờ, vẫn ở mức T2 và không có gậy nào

#### Scenario: Hai lượt dính cổng cứng

- **WHEN** tài khoản có 2 lượt dính cổng cứng trong 24 giờ qua và gửi một tin không dính cổng cứng
- **THEN** tài khoản không vào thời gian chờ

#### Scenario: Các lượt cách nhau quá 24 giờ

- **WHEN** lượt dính cổng cứng thứ nhất cách lượt thứ ba hơn 24 giờ
- **THEN** tài khoản không vào thời gian chờ

### Requirement: Chỉ cổng cứng mới tính là dò

Chỉ cổng cứng SHALL được đếm vào lượt dò. Tin bị giữ vì danh mục luôn duyệt tay, vì đánh dấu theo thiết
bị, vì chất lượng ảnh, vì điểm rủi ro hay vì lỗi của máy MUST NOT được đếm — để người dùng thật không bị chặn đăng
(TK 8).

#### Scenario: Ba tin thú cưng trong một ngày

- **WHEN** một tài khoản gửi 3 tin vào danh mục bật luôn duyệt tay trong 24 giờ, không tin nào dính cổng
  cứng
- **THEN** cả ba tin bị giữ cho người và tài khoản không vào thời gian chờ

#### Scenario: Tài khoản bị đánh dấu theo thiết bị gửi nhiều tin

- **WHEN** tài khoản đang bị đánh dấu "nhiều tài khoản trên một máy" gửi 3 tin trong 24 giờ, không tin nào
  dính cổng cứng
- **THEN** cả ba tin bị giữ cho người và tài khoản không vào thời gian chờ

#### Scenario: Ba tin ảnh mờ trong một ngày

- **WHEN** luật "ảnh mờ" đang bật và một tài khoản gửi 3 tin có ảnh mờ trong 24 giờ, không tin nào dính cổng cứng
- **THEN** cả ba tin bị giữ cho người và tài khoản không vào thời gian chờ

### Requirement: Trong thời gian chờ không gửi được tin mới

Trong thời gian chờ, lượt gửi tin mới — gửi nháp lần đầu, chuyển tin lên sàn chung — SHALL bị từ chối ngay, không
tạo tin, kèm thời điểm được gửi lại. Sửa, gửi lại, gia hạn tin đang có vẫn làm được và vẫn qua máy (chốt
12/10/2026). Câu
báo MUST NOT nêu cổng cứng, cụm từ hay ảnh nào đã trúng (TK nguyên tắc 8).

#### Scenario: Gửi tin trong thời gian chờ

- **WHEN** tài khoản đang trong thời gian chờ gửi một tin mới
- **THEN** response có HTTP 429 `SUBMISSION_COOLDOWN` kèm thời điểm được gửi lại, không tin nào được tạo,
  và câu báo không nêu cổng cứng nào đã trúng

#### Scenario: Hết thời gian chờ

- **WHEN** thời gian chờ 24 giờ đã qua và tài khoản gửi một tin mới
- **THEN** tin được nhận và qua máy như thường

### Requirement: Tin luôn giữ vẫn được chấm đủ

Tin bị giữ vì cổng cứng, danh mục luôn duyệt tay hay đánh dấu theo thiết bị SHALL vẫn được chấm đủ mọi dấu hiệu;
kết quả máy ghi điểm, dải và các luật đã trúng như mọi tin, để người duyệt thấy hết (TK 17, chốt 12/10/2026).

#### Scenario: Tin danh mục luôn duyệt tay có số Zalo

- **WHEN** một tin thuộc danh mục bật luôn duyệt tay ghi số Zalo trong mô tả
- **THEN** kết quả máy là giữ cho người, và kết quả ghi luật "liên hệ ngoài sàn" cùng điểm 20

### Requirement: Mỗi lượt qua máy dính cổng cứng đếm một lần

Lượt dò SHALL đếm theo lượt qua máy: một lượt trúng nhiều cổng cứng là một lần, và lượt gửi lại sau khi sửa cũng
được đếm (chốt 12/10/2026).

#### Scenario: Một lượt trúng hai cổng

- **WHEN** tài khoản chưa dính cổng cứng nào gửi một tin vừa chứa cụm từ cấm mức chắc vừa đặt giá vượt trần
- **THEN** tài khoản có một lượt dính cổng cứng trong 24 giờ, không phải hai

#### Scenario: Sửa rồi gửi lại vẫn dính

- **WHEN** tài khoản có 2 lượt dính cổng cứng trong 24 giờ sửa một tin rồi gửi lại, lượt này vẫn dính cổng cứng
- **THEN** tài khoản vào thời gian chờ 24 giờ
