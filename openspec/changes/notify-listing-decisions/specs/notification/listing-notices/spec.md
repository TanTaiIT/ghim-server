## ADDED Requirements

### Requirement: Báo người đăng kết quả duyệt tin

Người đăng SHALL được báo, có nhắc, khi người duyệt cho đạt một tin đang chờ duyệt, từ chối, gỡ hay khôi phục tin của
mình (TK 17). Thông báo thuộc nhóm "tin đăng của bạn" và mở được tin đó. Từ chối · gỡ SHALL nêu lý do và cho biết
người đăng sửa rồi gửi lại được (sai sót) hay không (vi phạm).

#### Scenario: Tin chờ duyệt được duyệt

- **WHEN** staff cho đạt tin "Xe đạp cũ" đang chờ duyệt
- **THEN** người đăng nhận thông báo có nhắc rằng tin đã được duyệt và đang hiển thị

#### Scenario: Bị từ chối vì sai sót

- **WHEN** staff từ chối tin "Xe đạp cũ" vì sai sót với lý do mẫu "Ảnh chưa rõ sản phẩm"
- **THEN** người đăng nhận thông báo có nhắc; nội dung trong app nêu "Ảnh chưa rõ sản phẩm" và cho biết sửa tin rồi
  gửi lại được

#### Scenario: Bị gỡ vì vi phạm

- **WHEN** staff gỡ một tin đang hiển thị vì vi phạm
- **THEN** người đăng nhận thông báo có nhắc rằng tin đã bị gỡ vì vi phạm quy định sàn và không sửa để gửi lại được

#### Scenario: Được khôi phục

- **WHEN** staff khôi phục một tin đã bị gỡ
- **THEN** người đăng nhận thông báo có nhắc rằng tin đã hiển thị lại

#### Scenario: Quyết định không còn áp được

- **WHEN** người đăng rút tin về nháp trong lúc staff đang xem, rồi staff từ chối tin đó
- **THEN** quyết định nhận HTTP 409 `LISTING_CHANGED` và người đăng không nhận thông báo nào về quyết định đó

### Requirement: Báo người đăng khi máy giữ tin

Người đăng SHALL được báo, có nhắc, khi máy giữ tin của mình chờ người duyệt hay rút một tin đang hiển thị về chờ
duyệt. Câu báo SHALL cùng mức với câu giải thích của máy: lỗi tự sửa được thì nói cụ thể; dấu hiệu gian lận chỉ nói
"tin cần kiểm tra an toàn thêm" kèm thời gian chờ ước tính, MUST NOT nêu tín hiệu cụ thể (TK 4 nguyên tắc 8). Tin vẫn
chờ thì MUST NOT nhắc lại.

#### Scenario: Máy giữ vì dấu hiệu gian lận

- **WHEN** máy giữ tin của một người vì ảnh trùng với tin của tài khoản khác
- **THEN** người đăng nhận thông báo có nhắc rằng tin cần kiểm tra an toàn thêm kèm thời gian chờ ước tính, và thông
  báo không nhắc tới ảnh trùng

#### Scenario: Máy rút tin đang hiện về chờ duyệt

- **WHEN** một cụm từ cấm mới được bật thật và máy rút một tin đang hiển thị về chờ duyệt
- **THEN** người đăng nhận thông báo có nhắc rằng tin tạm ngừng hiển thị để chờ người duyệt xem lại

### Requirement: Không nêu tên người duyệt

Quyết định của điều hành viên về tin trong nhóm MUST ký "Quản trị nhóm «tên nhóm»"; quyết định của staff hay master
MUST ký "Ghim". Không thông báo nào về quyết định với tin MUST nêu tên người duyệt.

#### Scenario: Quản trị nhóm từ chối tin trong nhóm

- **WHEN** điều hành viên Bình của nhóm "Hội phụ huynh 12A1" từ chối một tin trong nhóm
- **THEN** thông báo người đăng nhận ký "Quản trị nhóm «Hội phụ huynh 12A1»" và không có tên Bình

#### Scenario: Staff gỡ tin sàn chung

- **WHEN** staff Lan gỡ một tin sàn chung
- **THEN** thông báo người đăng nhận ký "Ghim" và không có tên Lan

### Requirement: Câu nhắc không lộ lý do

Câu nhắc hiện lên màn hình — banner trong app, đẩy lên điện thoại — MUST NOT chứa lý do từ chối hay gỡ, với cả sai sót
lẫn vi phạm. Lý do chỉ nằm trong nội dung thông báo xem trong app.

#### Scenario: Gỡ vì vi phạm có lý do

- **WHEN** staff gỡ tin "Pháo hoa Tết" vì vi phạm với lý do "Hàng cấm buôn bán"
- **THEN** câu nhắc gửi người đăng không chứa "Hàng cấm buôn bán"; lý do chỉ nằm trong nội dung thông báo trong app

### Requirement: Những chuyện về tin không báo

Máy cho qua ngay khi gửi, người duyệt cho đạt khi hậu kiểm một tin đang hiển thị, và mọi mũi tên người đăng tự đi —
gửi, sửa, rút về, gia hạn, đánh dấu đã bán, xoá — MUST NOT tạo thông báo nào về kết quả duyệt.

#### Scenario: Máy cho qua ngay

- **WHEN** máy cho qua một tin vừa gửi
- **THEN** người đăng không nhận thông báo nào về kết quả duyệt của tin đó

#### Scenario: Hậu kiểm đạt

- **WHEN** staff cho đạt một tin đang hiển thị được lấy mẫu hậu kiểm
- **THEN** người đăng không nhận thông báo nào

#### Scenario: Người đăng tự rút về

- **WHEN** người đăng rút tin chờ duyệt của mình về nháp
- **THEN** không ai nhận thông báo về việc đó
