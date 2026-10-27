## MODIFIED Requirements

### Requirement: Tin bị giữ luôn báo đang chờ người duyệt

Mọi tin bị máy giữ mà không trúng dấu hiệu gian lận nào SHALL cho người đăng thấy câu "Tin đang chờ người
duyệt, thường trong 24 giờ" (hạn 24 giờ là giá trị khởi đầu), dù tin bị giữ vì lý do gì khác. Tin có trúng dấu
hiệu gian lận thì thấy câu chung ba phần thay cho câu này. Tin giữ chỉ vì nhóm bật "duyệt tay mọi tin"
(`group/manual-review`) SHALL thấy câu "Nhóm duyệt mọi tin trước khi hiện — tin đang chờ quản trị nhóm, thường
trong 24 giờ" và MUST NOT thấy câu chung ba phần, kể cả khi tin trúng nhẹ một dấu hiệu gian lận mà máy vẫn cho qua.

#### Scenario: Tin bị giữ vì dải Cao

- **WHEN** tin của người đăng bị giữ vì điểm rủi ro ở dải Cao, chỉ từ các dấu hiệu không phải gian lận (giá
  bất thường, chữ như gõ bừa, liên hệ ngoài sàn)
- **THEN** người đăng xem tin của mình thấy câu "Tin đang chờ người duyệt, thường trong 24 giờ"

#### Scenario: Tin bị giữ vì danh mục luôn duyệt tay

- **WHEN** tin bị giữ chỉ vì danh mục bật luôn duyệt tay
- **THEN** người đăng thấy câu "Tin đang chờ người duyệt, thường trong 24 giờ"

#### Scenario: Tin bị giữ vì lỗi của máy

- **WHEN** tin của người đăng bị giữ vì kho ảnh không trả lời lúc kiểm ảnh
- **THEN** người đăng thấy câu "Tin đang chờ người duyệt, thường trong 24 giờ"

#### Scenario: Tin bị giữ vì chất lượng ảnh

- **WHEN** tin bị giữ chỉ vì luật "ảnh quá tối" trúng ảnh thứ nhất
- **THEN** người đăng thấy câu "Tin đang chờ người duyệt, thường trong 24 giờ" cùng câu giải thích ảnh thứ nhất quá tối

#### Scenario: Tin bị giữ vì nhóm duyệt tay

- **WHEN** tin gửi vào nhóm bật "duyệt tay mọi tin" bị giữ chỉ vì công tắc đó
- **THEN** người đăng thấy câu "Nhóm duyệt mọi tin trước khi hiện — tin đang chờ quản trị nhóm, thường trong 24 giờ"
