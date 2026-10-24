## MODIFIED Requirements

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

- **WHEN** tin của người đăng bị giữ vì kho ảnh không trả lời lúc kiểm ảnh
- **THEN** người đăng thấy câu "Tin đang chờ người duyệt, thường trong 24 giờ"

#### Scenario: Tin bị giữ vì chất lượng ảnh

- **WHEN** tin bị giữ chỉ vì luật "ảnh quá tối" trúng ảnh thứ nhất
- **THEN** người đăng thấy câu "Tin đang chờ người duyệt, thường trong 24 giờ" cùng câu giải thích ảnh thứ nhất quá tối

### Requirement: Lỗi tự sửa được thì giải thích cách sửa

Khi máy giữ tin hoặc cho hiện hạn chế, mỗi lỗi tự sửa được mà tin trúng SHALL được nêu bằng một câu dễ hiểu, kèm việc
người đăng làm được ngay. Lỗi tự sửa được gồm:

- giá lệch xa mức thường thấy, giá vượt trần, sai danh mục;
- số điện thoại hay liên hệ ngoài sàn trong mô tả;
- ảnh hỏng, và mỗi luật chất lượng ảnh đang bật mà tin trúng.

Câu về ảnh SHALL nói ảnh thứ mấy. Luật đang chạy thử MUST NOT sinh câu giải thích.

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

#### Scenario: Ảnh quá nhỏ

- **WHEN** tin bị giữ vì luật "ảnh quá nhỏ" đang bật trúng ảnh thứ hai
- **THEN** người đăng thấy câu nói ảnh thứ hai quá nhỏ, kèm gợi ý thay bằng ảnh chụp rõ hơn

#### Scenario: Hai ảnh trúng hai luật

- **WHEN** tin bị giữ vì ảnh thứ nhất mờ và ảnh thứ ba quá sáng, cả hai luật đang bật
- **THEN** người đăng thấy hai câu: một cho ảnh thứ nhất bị mờ, một cho ảnh thứ ba quá sáng

#### Scenario: Luật chất lượng đang chạy thử

- **WHEN** luật "ảnh mờ" đang chạy thử, trúng một ảnh, và tin bị giữ vì lý do khác
- **THEN** người đăng không thấy câu nào về ảnh mờ
