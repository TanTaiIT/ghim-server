# screening/image-checks Specification

## Purpose

Kiểm từng ảnh của tin — trùng với ảnh của tài khoản khác; nội dung nhạy cảm thêm ở `add-image-moderation` — và
bảo đảm không ảnh nào hiện
công khai trước khi có kết quả (TK 13, TK 25, cam kết 4).

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

Staff và master SHALL thêm, gỡ được ảnh mẫu của hãng trong danh sách trắng. Ảnh trùng với một ảnh trong danh
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
