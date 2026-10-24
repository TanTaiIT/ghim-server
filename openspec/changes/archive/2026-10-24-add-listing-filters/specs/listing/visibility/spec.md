## ADDED Requirements

### Requirement: Lọc theo mẫu thông tin của danh mục

Tìm kiếm và bảng tin danh mục SHALL lọc được theo các mục của mẫu thông tin hiện hành của danh mục đang chọn (TK 11):
mục chọn một và mục chọn nhiều theo một hay nhiều giá trị, mục số theo khoảng từ – tới. Tin chọn một khớp khi giá trị
của nó là một trong các giá trị đã chọn; tin chọn nhiều khớp khi có ít nhất một giá trị đã chọn. Tin không có mục đang
lọc MUST NOT có trong kết quả. Lọc theo mẫu MUST NOT đổi luật ai thấy tin hay thứ tự theo vị trí trên bảng tin.

#### Scenario: Lọc một mục chọn một

- **WHEN** khách tìm trong danh mục Điện thoại với hãng là Apple
- **THEN** kết quả chỉ gồm tin có hãng Apple

#### Scenario: Chọn một theo hai giá trị

- **WHEN** khách tìm trong danh mục Điện thoại với hãng là Apple hoặc Samsung
- **THEN** kết quả gồm tin hãng Apple và tin hãng Samsung, không có tin hãng khác

#### Scenario: Chọn nhiều khớp một trong các giá trị

- **WHEN** khách lọc màu đen hoặc bạc, có một tin màu đen và trắng, một tin chỉ màu trắng
- **THEN** kết quả có tin màu đen và trắng, không có tin chỉ màu trắng

#### Scenario: Khoảng số

- **WHEN** khách tìm trong danh mục Xe máy với năm sản xuất từ 2018 tới 2020
- **THEN** kết quả chỉ gồm tin có năm sản xuất từ 2018 tới 2020, kể cả hai đầu

#### Scenario: Tin thiếu mục đang lọc

- **WHEN** khách lọc dung lượng 128GB và một tin điện thoại đăng theo mẫu cũ không có mục dung lượng
- **THEN** tin đó không có trong kết quả

#### Scenario: Kết quả lọc vẫn theo luật hiển thị và thứ tự

- **WHEN** khách tìm chung với hãng là Apple, có một tin "nhóm công khai" hãng Apple và hai tin sàn chung hãng Apple
- **THEN** kết quả chỉ có hai tin sàn chung, xếp theo vị trí trên bảng tin như khi không lọc

### Requirement: Bộ lọc theo mẫu phải đúng mẫu hiện hành

Lọc theo mẫu SHALL chỉ nhận khi đã chọn danh mục, và mỗi mục lọc MUST là mục chọn một, chọn nhiều hay số của mẫu hiện
hành của danh mục đó, với giá trị nằm trong danh sách lựa chọn của mục (mục chọn) hoặc là số (mục số). Sai MUST trả HTTP
400 `VALIDATION_ERROR` nêu mục sai.

#### Scenario: Lọc mà chưa chọn danh mục

- **WHEN** khách tìm với bộ lọc hãng là Apple mà không chọn danh mục
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Lọc mục chữ hoặc mục không có trong mẫu

- **WHEN** khách lọc danh mục Điện thoại theo mục ghi chú (mục chữ) hoặc theo một mục không có trong mẫu
- **THEN** response có HTTP 400 `VALIDATION_ERROR` nêu mục đó

#### Scenario: Giá trị không có trong lựa chọn

- **WHEN** khách lọc hãng là "Nokia" mà mục hãng của mẫu không có lựa chọn đó
- **THEN** response có HTTP 400 `VALIDATION_ERROR` nêu mục hãng
