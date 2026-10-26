# screening/image-checks Specification

## Purpose

Kiểm từng ảnh của tin — trùng với ảnh của tài khoản khác, và chất lượng (hỏng, quá nhỏ, mờ, quá tối, quá sáng); không
kiểm nội dung ảnh (chốt 24/10/2026) — và bảo đảm không ảnh nào hiện công khai trước khi có kết quả (TK 13, TK 25, cam
kết 4).

## Requirements

### Requirement: Tin chỉ hiện khi có kết quả cho chữ và mọi ảnh

Chữ của tin SHALL được chấm ngay khi gửi, các ảnh được kiểm song song. Tin MUST NOT hiện với người khác khi
chưa có kết quả máy cho cả chữ lẫn từng ảnh — không có khoảng trống nào để ảnh xấu hiện công khai.

#### Scenario: Còn một ảnh chưa có kết quả

- **WHEN** chữ của một tin 3 ảnh đã chấm xong, hai ảnh đã có kết quả, ảnh thứ ba chưa có
- **THEN** tin vẫn ở trạng thái đang kiểm và không hiện với người khác

#### Scenario: Đủ kết quả

- **WHEN** chữ và cả 3 ảnh của tin đều đã có kết quả, không trúng gì, người đăng là T2
- **THEN** kết quả máy là hiện đầy đủ

### Requirement: Ảnh trùng với tin của tài khoản khác là cổng cứng

Mỗi ảnh SHALL được so trùng với ảnh của tài khoản khác đã kiểm xong trước nó. Ảnh giống hệt hoặc gần như giống hệt
một ảnh như vậy SHALL làm tin dính cổng cứng "ảnh trùng". Ảnh của tài khoản khác kiểm xong sau — kể cả bản chép — MUST
NOT làm tin dính cổng này: người đăng trước thắng (chốt 16/10/2026). Ảnh trùng với ảnh của chính người đăng MUST NOT
tính.

#### Scenario: Dùng lại ảnh của người khác

- **WHEN** tài khoản B gửi tin có một ảnh gần như giống hệt ảnh trong tin của tài khoản A
- **THEN** tin của B dính cổng cứng "ảnh trùng" và kết quả máy là giữ cho người

#### Scenario: Dùng lại ảnh của chính mình

- **WHEN** tài khoản A gửi tin mới có một ảnh giống hệt ảnh trong tin cũ của chính A
- **THEN** tin không dính cổng cứng "ảnh trùng"

#### Scenario: Chủ ảnh sửa tin sau khi bị chép

- **WHEN** tài khoản B gửi tin dùng lại ảnh trong tin đang hiển thị của tài khoản A, rồi A sửa giá tin của mình
- **THEN** tin của B dính cổng cứng "ảnh trùng", còn tin của A không dính và máy cho qua như trước khi B chép

### Requirement: Danh sách trắng ảnh mẫu của hãng

Staff và master SHALL xem, thêm, gỡ được ảnh mẫu của hãng trong danh sách trắng; danh sách SHALL kèm ảnh nguồn khi ảnh
đó còn trong kho. Ảnh trùng với một ảnh trong danh
sách trắng MUST NOT tính là ảnh trùng.

#### Scenario: Hai người cùng dùng ảnh mẫu của hãng

- **WHEN** ảnh mẫu một mẫu điện thoại nằm trong danh sách trắng và hai tài khoản khác nhau cùng dùng ảnh đó
  trong tin của mình
- **THEN** không tin nào dính cổng cứng "ảnh trùng" vì ảnh đó

#### Scenario: Staff gỡ ảnh khỏi danh sách trắng

- **WHEN** staff gỡ một ảnh khỏi danh sách trắng rồi tài khoản B gửi tin dùng ảnh đó, vốn đã có trong tin
  của tài khoản A
- **THEN** tin của B dính cổng cứng "ảnh trùng"

#### Scenario: Người dùng thường thêm ảnh vào danh sách trắng

- **WHEN** một tài khoản không mang quyền staff thêm ảnh vào danh sách trắng
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Staff xem danh sách trắng

- **WHEN** staff mở danh sách trắng có một ảnh mẫu vừa thêm từ ảnh của một tin
- **THEN** mục đó kèm đường xem mở được đúng ảnh nguồn; ảnh nguồn đã bị dọn khỏi kho thì đường xem là `null` và mục vẫn
  chặn ảnh trùng

### Requirement: Mọi ảnh của lượt gửi đều được kiểm

Mọi ảnh của một lượt gửi SHALL được kiểm, kể cả khi lượt đó đã kết luận trước khi ảnh có kết quả (chấm chữ lỗi,
quá hạn): ảnh đã kiểm là ứng viên so trùng cho mọi tin gửi sau. Ảnh chờ kết quả quá thời gian chờ ảnh (5 phút,
giá trị khởi đầu) SHALL được xếp kiểm lại, mỗi ảnh tối đa một lần trong mỗi khoảng chờ (chốt 15/10/2026).

#### Scenario: Chấm chữ lỗi vẫn kiểm ảnh

- **WHEN** việc chấm chữ báo lỗi lúc một tin 2 ảnh được gửi
- **THEN** kết quả máy là giữ cho người, và cả 2 ảnh vẫn được kiểm, có kết quả

#### Scenario: Ảnh kẹt chờ kiểm

- **WHEN** một ảnh chờ kết quả đã hơn 5 phút mà việc kiểm chưa chạy, và lượt rà chạy hai lần liền nhau
- **THEN** ảnh được xếp kiểm lại đúng một lần

### Requirement: Lỗi tạm thời của kho được kiểm lại ở lượt gửi sau

Ảnh có kết quả lỗi vì kho không trả lời sau mọi lượt thử SHALL được kiểm lại khi một lượt gửi sau dùng nó: lượt đó
chờ kết quả mới như ảnh chưa kiểm. Ảnh lỗi vì tệp không còn hay không đọc được MUST NOT được kiểm lại — lượt gửi
sau giữ cho người ngay như cũ (chốt 15/10/2026).

#### Scenario: Kho trở lại sau lượt lỗi

- **WHEN** việc kiểm một ảnh lỗi vì kho không trả lời, tin bị giữ cho người, rồi kho trả lời lại và người đăng sửa tin gửi lại
- **THEN** ảnh được kiểm lại và kết quả máy của lượt mới tính như ảnh bình thường

#### Scenario: Ảnh không đọc được

- **WHEN** việc kiểm một ảnh lỗi vì tệp không đọc được, rồi người đăng sửa tin gửi lại
- **THEN** lượt mới giữ cho người ngay, ảnh không được kiểm lại

### Requirement: Ảnh đã xoá hẳn không còn để so trùng

Ảnh bị xoá hẳn khỏi kho SHALL không còn được dùng để so trùng với ảnh của tài khoản khác. Dấu ảnh đã kiểm của nó MUST
được bỏ cùng lúc ảnh bị xoá hẳn.

#### Scenario: Ảnh bị thay rồi được dọn

- **WHEN** người dùng thay ảnh đại diện, lượt đối chiếu kho xoá hẳn ảnh cũ, và ảnh cũ đã có dấu ảnh đã kiểm
- **THEN** dấu ảnh của ảnh cũ không còn, dấu ảnh của ảnh mới vẫn còn

### Requirement: Ảnh hỏng giữ cho người kèm cách sửa

Ảnh hỏng — kho không còn tệp, hoặc có tệp mà không giải mã được — SHALL làm tin bị giữ cho người, như hôm nay. Người đăng
SHALL thấy ảnh thứ mấy bị hỏng và cách sửa. Kho không trả lời sau mọi lượt thử MUST vẫn là lỗi của máy, không phải ảnh
hỏng. Giữ vì ảnh hỏng MUST NOT tắt được.

#### Scenario: Ảnh thứ hai không giải mã được

- **WHEN** tài khoản T2 gửi tin 3 ảnh, chữ không trúng gì, và tệp của ảnh thứ hai không giải mã được
- **THEN** kết quả máy là giữ cho người, và người đăng thấy ảnh thứ hai không mở được kèm gợi ý xoá ảnh đó rồi tải ảnh
  khác

#### Scenario: Kho không trả lời

- **WHEN** kho ảnh không trả lời mọi lượt đọc một ảnh của tin
- **THEN** kết quả máy là giữ cho người vì lỗi của máy, và người đăng không thấy câu nào nói ảnh hỏng

### Requirement: Đo chất lượng từng ảnh

Mỗi ảnh của tin SHALL được đo cỡ, độ nét và độ sáng trong cùng lượt kiểm ảnh với so trùng. Bốn luật chất lượng ảnh của
máy so số đo với ngưỡng:

- ảnh quá nhỏ: cạnh ngắn dưới ngưỡng;
- ảnh mờ: độ nét dưới ngưỡng;
- ảnh quá tối: độ sáng trung bình dưới ngưỡng;
- ảnh quá sáng: độ sáng trung bình trên ngưỡng.

#### Scenario: Ảnh được kiểm

- **WHEN** một ảnh 512×512 của tin được kiểm
- **THEN** kết quả kiểm của ảnh ghi rộng 512, cao 512, cùng độ nét và độ sáng của ảnh

### Requirement: Luật chất lượng ảnh bật thì giữ cho người

Luật chất lượng ảnh đang bật mà trúng ít nhất một ảnh SHALL làm tin bị giữ cho người, ở mọi mức tin cậy, mọi dải điểm và
mọi nơi đăng. Mỗi luật SHALL bật, chạy thử hoặc tắt được; luật mới bắt đầu ở chế độ chạy thử (`screening/rule-management`).
Luật chất lượng ảnh MUST NOT cộng điểm rủi ro.

#### Scenario: Ảnh quá nhỏ khi luật đang bật

- **WHEN** luật "ảnh quá nhỏ" đang bật với ngưỡng 480 và tài khoản T3 gửi tin có một ảnh 640×360, không trúng gì khác
- **THEN** kết quả máy là giữ cho người

#### Scenario: Luật đang chạy thử

- **WHEN** luật "ảnh mờ" đang chạy thử và tài khoản T2 gửi tin có một ảnh mờ, không trúng gì khác
- **THEN** kết quả máy là hiện đầy đủ, và kết quả ghi lượt trúng "ảnh mờ" ở chế độ chạy thử

#### Scenario: Luật bị tắt

- **WHEN** master tắt luật "ảnh quá tối" rồi một tài khoản gửi tin có ảnh quá tối
- **THEN** tin không trúng "ảnh quá tối" và kết quả máy không ghi luật này

#### Scenario: Ảnh đạt mọi ngưỡng

- **WHEN** mọi luật chất lượng ảnh đang bật và mọi ảnh của tin đều đạt ngưỡng
- **THEN** tin không bị giữ vì chất lượng ảnh

#### Scenario: Không cộng điểm

- **WHEN** luật "ảnh quá sáng" đang bật và trúng một ảnh của tin
- **THEN** điểm rủi ro của tin không đổi so với khi ảnh đó đạt ngưỡng

### Requirement: Ngưỡng chất lượng ảnh trong bảng con số

Bốn ngưỡng SHALL nằm trong bảng con số và master chỉnh được:

- cạnh ngắn tối thiểu (giá trị khởi đầu 480 điểm ảnh);
- độ nét tối thiểu;
- độ sáng tối thiểu;
- độ sáng tối đa.

Số đo của ảnh SHALL được giữ lại, và mỗi lượt gửi SHALL so số đo với ngưỡng hiện hành lúc gửi — đổi ngưỡng không cần
kiểm lại ảnh. Ảnh được kiểm trước khi có phép đo MUST NOT bị coi là trúng luật chất lượng nào.

#### Scenario: Master hạ ngưỡng cạnh ngắn

- **WHEN** master hạ cạnh ngắn tối thiểu từ 480 xuống 320 rồi một tài khoản gửi lại tin có ảnh 640×360 đã kiểm từ trước
- **THEN** tin không trúng "ảnh quá nhỏ"

#### Scenario: Ảnh kiểm trước change này

- **WHEN** một tin dùng ảnh đã có kết quả so trùng từ trước khi máy đo chất lượng ảnh
- **THEN** tin không trúng luật chất lượng ảnh nào vì ảnh đó
