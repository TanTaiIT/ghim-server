## ADDED Requirements

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
