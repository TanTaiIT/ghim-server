## Purpose

Cho mỗi loại dữ liệu một hạn lưu — hết hạn thì xoá hẳn, gộp thành số liệu hay ẩn danh hoá — để không gì bị giữ
mãi trừ quyết định và nhật ký, và chúng không chứa nội dung tin (TK 25, nguyên tắc 9). Ảnh của nháp, tin hay hồ
sơ bị xoá hẳn đi theo chủ của nó, theo `media/image-cleanup`.

## ADDED Requirements

### Requirement: Bản nháp bỏ dở

Bản nháp không được sửa trong 7 ngày SHALL bị xoá hẳn. Mỗi lần sửa nháp MUST tính lại 7 ngày từ lần sửa đó.

#### Scenario: Quá 7 ngày không sửa

- **WHEN** một bản nháp không được sửa trong hơn 7 ngày
- **THEN** nháp bị xoá hẳn ở lượt dọn kế tiếp

#### Scenario: Mới sửa gần đây

- **WHEN** một bản nháp tạo 10 ngày trước được sửa lần cuối 3 ngày trước
- **THEN** nháp còn nguyên

### Requirement: Tin bị từ chối hay gỡ vì sai sót, tin bị gỡ khỏi nhóm

Tin bị từ chối hay bị gỡ vì sai sót, và tin bị gỡ khỏi nhóm, SHALL bị xoá hẳn khi không được sửa trong 90 ngày
kể từ lần sửa cuối.

#### Scenario: Tin bị từ chối vì sai sót bị bỏ mặc

- **WHEN** một tin bị từ chối vì sai sót không được sửa trong hơn 90 ngày
- **THEN** tin bị xoá hẳn ở lượt dọn kế tiếp

#### Scenario: Tin bị gỡ khỏi nhóm bị bỏ mặc

- **WHEN** một tin bị gỡ khỏi nhóm không được sửa trong hơn 90 ngày
- **THEN** tin bị xoá hẳn ở lượt dọn kế tiếp

#### Scenario: Sửa trong hạn

- **WHEN** một tin bị gỡ vì sai sót được sửa lần cuối 30 ngày trước
- **THEN** tin còn nguyên

### Requirement: Tin bị từ chối hay gỡ vì vi phạm

Tin bị từ chối hay bị gỡ vì vi phạm SHALL được giữ tới khi gậy đi kèm hết hạn thêm 30 ngày; với gậy nghiêm trọng
thì 2 năm kể từ ngày khoá tài khoản. Hết hạn đó, tin SHALL bị xoá hẳn, còn quyết định về tin MUST được giữ lại.

#### Scenario: Gậy mới hết hạn

- **WHEN** gậy thường đi kèm một tin bị gỡ vì vi phạm đã hết hạn được 20 ngày
- **THEN** tin còn nguyên

#### Scenario: Quá 30 ngày sau khi gậy hết hạn

- **WHEN** gậy thường đi kèm một tin bị gỡ vì vi phạm đã hết hạn hơn 30 ngày
- **THEN** tin bị xoá hẳn ở lượt dọn kế tiếp, còn quyết định gỡ tin đó vẫn còn

### Requirement: Tin người đăng tự xoá

Tin người đăng tự xoá SHALL bị xoá hẳn sau 30 ngày kể từ lúc xoá.

#### Scenario: Chưa đủ 30 ngày

- **WHEN** người đăng xoá một tin 20 ngày trước
- **THEN** bản lưu của tin chưa bị xoá hẳn

#### Scenario: Quá 30 ngày

- **WHEN** người đăng xoá một tin hơn 30 ngày trước và tin không dính việc nào đang mở
- **THEN** tin bị xoá hẳn ở lượt dọn kế tiếp

### Requirement: Tin đã bán

Tin đã bán SHALL bị xoá hẳn sau 180 ngày kể từ lúc được đánh dấu đã bán.

#### Scenario: Trong 180 ngày

- **WHEN** một tin được đánh dấu đã bán 100 ngày trước
- **THEN** tin vẫn xem được như mọi tin đã bán

#### Scenario: Quá 180 ngày

- **WHEN** một tin được đánh dấu đã bán hơn 180 ngày trước
- **THEN** tin bị xoá hẳn ở lượt dọn kế tiếp, và mở đường link của tin nhận HTTP 404 `NOT_FOUND`

### Requirement: Tin hết hạn

Tin hết hạn SHALL bị xoá hẳn sau 1 năm kể từ lúc hết hạn. Người đăng SHALL được nhắc trước 7 ngày, để còn kịp
gia hạn.

#### Scenario: Nhắc trước 7 ngày

- **WHEN** còn 7 ngày nữa là tròn 1 năm kể từ lúc một tin hết hạn
- **THEN** người đăng nhận thông báo rằng tin sẽ bị xoá hẳn sau 7 ngày

#### Scenario: Quá 1 năm

- **WHEN** một tin đã hết hạn hơn 1 năm
- **THEN** tin bị xoá hẳn ở lượt dọn kế tiếp

#### Scenario: Gia hạn sau khi được nhắc

- **WHEN** người đăng gia hạn tin sau khi được nhắc và tin lên bảng lại
- **THEN** tin không bị xoá theo hạn của tin hết hạn

### Requirement: Tin của nhóm đã đóng

Tin của một nhóm đã đóng SHALL bị xoá hẳn sau 90 ngày kể từ lúc đóng nhóm, và danh sách thành viên của nhóm SHALL
bị xoá cùng lúc.

#### Scenario: Chưa đủ 90 ngày

- **WHEN** một nhóm đã đóng được 60 ngày
- **THEN** tin trong nhóm và danh sách thành viên chưa bị xoá hẳn

#### Scenario: Quá 90 ngày

- **WHEN** một nhóm đã đóng hơn 90 ngày
- **THEN** tin trong nhóm và danh sách thành viên bị xoá hẳn ở lượt dọn kế tiếp

#### Scenario: Tin đã chuyển lên sàn chung

- **WHEN** người đăng đã chuyển một tin của nhóm lên sàn chung trong thời hạn được chuyển sau khi nhóm đóng
- **THEN** tin trên sàn chung không bị xoá theo hạn của nhóm đã đóng

### Requirement: Tài khoản đã xoá

Tài khoản người dùng tự xoá SHALL bị xoá hẳn tin và hồ sơ sau 90 ngày kể từ lúc xoá. Hội thoại của tài khoản đó
MUST NOT bị xoá theo hạn này mà theo hạn lưu của hội thoại.

#### Scenario: Chưa đủ 90 ngày

- **WHEN** một tài khoản đã xoá được 60 ngày
- **THEN** tin và hồ sơ của nó vẫn ẩn với mọi người nhưng chưa bị xoá hẳn

#### Scenario: Quá 90 ngày

- **WHEN** một tài khoản đã xoá hơn 90 ngày
- **THEN** tin và hồ sơ của nó bị xoá hẳn ở lượt dọn kế tiếp

#### Scenario: Hội thoại với người còn lại

- **WHEN** tin và hồ sơ của một tài khoản đã xoá vừa bị xoá hẳn
- **THEN** người từng nhắn với tài khoản đó vẫn đọc được hội thoại của hai người

### Requirement: Dấu băm email kèm gậy

Dấu băm email giữ để nhận ra người đăng ký lại bằng cùng email SHALL chỉ được giữ 2 năm cùng gậy đi kèm, rồi bị
xoá — trừ dấu băm email của tài khoản bị khoá vĩnh viễn, giữ theo luật riêng ở dưới.

#### Scenario: Gậy hết hạn được 1 năm

- **WHEN** gậy thường đi kèm dấu băm email của một tài khoản đã xoá hết hạn được 1 năm
- **THEN** dấu băm vẫn còn

#### Scenario: Gậy hết hạn hơn 2 năm

- **WHEN** gậy thường đi kèm dấu băm email của một tài khoản đã xoá hết hạn hơn 2 năm
- **THEN** dấu băm bị xoá ở lượt dọn kế tiếp

### Requirement: Dấu băm email của tài khoản bị khoá vĩnh viễn

Dấu băm email của tài khoản bị master khoá vĩnh viễn SHALL được giữ tới khi master gỡ khoá, không theo hạn 2 năm
cùng gậy và không theo việc ẩn danh hoá gậy (TK 22, TK 25). Trong lúc khoá còn, lượt dọn MUST NOT xoá dấu băm đó,
kể cả khi đã tới hạn master xem lại mỗi 2 năm (giá trị khởi đầu) mà chưa có quyết định. Gỡ khoá thì dấu băm giữ
vì khoá đó SHALL bị xoá.

#### Scenario: Master giữ tiếp sau 2 năm

- **WHEN** một tài khoản bị khoá vĩnh viễn hơn 2 năm trước, gậy nghiêm trọng của nó đã được ẩn danh hoá, và
  master chọn giữ tiếp ở lần xem lại
- **THEN** dấu băm email của tài khoản đó vẫn còn và email vẫn bị chặn đăng ký

#### Scenario: Tới hạn xem lại mà chưa có quyết định

- **WHEN** một tài khoản bị khoá vĩnh viễn đã quá 2 năm và việc xem lại chưa có quyết định
- **THEN** lượt dọn kế tiếp không xoá dấu băm email của tài khoản đó

#### Scenario: Master gỡ khoá

- **WHEN** master gỡ khoá vĩnh viễn ở lần xem lại
- **THEN** dấu băm email giữ vì khoá đó bị xoá ở lượt dọn kế tiếp

### Requirement: Dữ liệu thiết bị

Mỗi lượt ghi dấu thiết bị, và địa chỉ mạng ghi lúc đăng ký, SHALL bị xoá sau 180 ngày (giá trị khởi đầu) kể từ
lúc ghi.

#### Scenario: Ngoài cửa sổ đếm nhưng còn trong hạn lưu

- **WHEN** một lượt ghi dấu thiết bị đã được 100 ngày
- **THEN** lượt ghi vẫn còn, dù không còn được tính vào số tài khoản đăng tin của máy

#### Scenario: Quá 180 ngày

- **WHEN** một lượt ghi dấu thiết bị đã hơn 180 ngày
- **THEN** lượt ghi bị xoá ở lượt dọn kế tiếp

#### Scenario: Địa chỉ mạng lúc đăng ký

- **WHEN** một tài khoản đăng ký hơn 180 ngày trước
- **THEN** địa chỉ mạng ghi lúc đăng ký bị xoá ở lượt dọn kế tiếp, còn tài khoản vẫn dùng bình thường

### Requirement: Hội thoại

Hội thoại SHALL bị xoá hẳn cùng mọi tin nhắn khi cả hai bên đã xoá nó ở phía mình, hoặc khi đã 1 năm không bên
nào nhắn.

#### Scenario: Cả hai bên đã xoá

- **WHEN** cả hai bên đã xoá một hội thoại ở phía mình
- **THEN** hội thoại và mọi tin nhắn của nó bị xoá hẳn ở lượt dọn kế tiếp

#### Scenario: Mới một bên xoá

- **WHEN** chỉ một bên đã xoá một hội thoại có tin nhắn cuối 2 tháng trước
- **THEN** hội thoại còn nguyên và bên kia vẫn đọc được

#### Scenario: Một năm không ai nhắn

- **WHEN** một hội thoại chưa bên nào xoá có tin nhắn cuối hơn 1 năm trước
- **THEN** hội thoại và mọi tin nhắn của nó bị xoá hẳn ở lượt dọn kế tiếp

#### Scenario: Chưa tới một năm

- **WHEN** một hội thoại chưa bên nào xoá có tin nhắn cuối 11 tháng trước
- **THEN** hội thoại còn nguyên

### Requirement: Thông báo

Thông báo SHALL bị xoá sau 90 ngày kể từ lúc gửi.

#### Scenario: Quá 90 ngày

- **WHEN** một thông báo đã gửi hơn 90 ngày
- **THEN** thông báo không còn trong hộp thư sau lượt dọn kế tiếp

#### Scenario: Trong 90 ngày

- **WHEN** một thông báo đã gửi 60 ngày
- **THEN** thông báo vẫn nằm trong hộp thư

### Requirement: Kết quả chấm điểm của máy

Kết quả chấm điểm của máy cho từng tin SHALL được gộp thành số liệu thống kê sau 180 ngày; kết quả riêng của từng
tin MUST NOT còn lại sau khi gộp.

#### Scenario: Quá 180 ngày

- **WHEN** kết quả máy chấm cho một tin đã hơn 180 ngày
- **THEN** sau lượt dọn kế tiếp, kết quả riêng của tin đó không còn, còn số liệu thống kê theo từng luật — như tỉ
  lệ tin máy giữ mà người cho qua — vẫn tính nó

#### Scenario: Trong 180 ngày

- **WHEN** kết quả máy chấm cho một tin mới được 100 ngày
- **THEN** người xử việc về tin đó vẫn thấy điểm và các luật máy đã trúng

### Requirement: Ẩn danh hoá gậy

Gậy SHALL được ẩn danh hoá 2 năm sau khi hết hạn — gậy nghiêm trọng thì 2 năm sau khi khoá tài khoản — cùng mọi
dòng nhật ký liên quan tới gậy đó: chỉ còn mã giả thay cho người nhận gậy.

#### Scenario: Gậy hết hạn hơn 2 năm

- **WHEN** một gậy thường đã hết hạn hơn 2 năm
- **THEN** sau lượt dọn kế tiếp, gậy và các dòng nhật ký về nó không còn nêu tài khoản, tên hay email của người
  nhận gậy — chỉ còn mã giả

#### Scenario: Gậy hết hạn chưa tới 2 năm

- **WHEN** một gậy thường đã hết hạn được 1 năm
- **THEN** gậy và các dòng nhật ký về nó còn nguyên

### Requirement: Quyết định giữ mãi, không chứa nội dung tin

Mọi quyết định của người duyệt, kể cả của điều hành nhóm, SHALL được giữ mãi — không lượt dọn nào xoá, kể cả khi
tin của quyết định đã bị xoá hẳn — và MUST NOT chứa nội dung tin. Nhật ký thao tác của bàn vận hành theo
`platform/audit-log`.

#### Scenario: Tin đã bị xoá hẳn, quyết định còn

- **WHEN** một tin bị gỡ vì vi phạm đã bị xoá hẳn theo hạn lưu
- **THEN** quyết định gỡ tin đó vẫn còn, với người xử, hành động, quy định được trích, lý do và thời điểm

#### Scenario: Quyết định không chứa nội dung tin

- **WHEN** master xem một quyết định về một tin
- **THEN** quyết định chỉ mang mã tin, không có tiêu đề, mô tả, giá, ảnh hay thông tin theo mẫu của tin

#### Scenario: Quyết định cũ không bị dọn

- **WHEN** lượt dọn dữ liệu chạy
- **THEN** không quyết định nào bị xoá, dù cũ tới đâu
