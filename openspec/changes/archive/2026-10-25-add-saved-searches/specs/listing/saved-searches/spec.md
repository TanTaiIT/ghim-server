## Purpose

Cho người đã đăng nhập lưu một lượt tìm trên sàn chung và được báo khi có tin mới khớp — báo theo luật của bảng tin,
không theo luật tìm kiếm có từ khoá (TK 24, TK 15).

## ADDED Requirements

### Requirement: Lưu một lượt tìm

Người đã đăng nhập SHALL lưu được một lượt tìm trên sàn chung gồm từ khoá và các bộ lọc danh mục, tỉnh, phường, khoảng
giá. Lưu lại đúng lượt tìm đã có MUST NOT tạo thêm lượt tìm. Mỗi tài khoản giữ tối đa 10 lượt tìm (giá trị khởi đầu).

#### Scenario: Lưu lượt tìm mới

- **WHEN** người dùng lưu lượt tìm từ khoá "samsung" trong danh mục Điện thoại
- **THEN** response có HTTP 201 và lượt tìm có trong danh sách đã lưu của người đó

#### Scenario: Lưu lại lượt tìm đã có

- **WHEN** người dùng lưu lại đúng từ khoá và bộ lọc của một lượt tìm đã lưu, chỉ khác hoa thường hay dấu
- **THEN** response có HTTP 200 với lượt tìm cũ và danh sách không thêm dòng

#### Scenario: Thiếu từ khoá

- **WHEN** người dùng lưu lượt tìm không có từ khoá
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Chạm trần

- **WHEN** người đã lưu 10 lượt tìm lưu thêm lượt thứ 11
- **THEN** response có HTTP 409 `CONFLICT` và danh sách giữ nguyên 10 lượt

#### Scenario: Chưa đăng nhập

- **WHEN** khách lưu một lượt tìm
- **THEN** response có HTTP 401 `UNAUTHORIZED`

### Requirement: Xem và xoá lượt tìm đã lưu

Người dùng SHALL xem được các lượt tìm mình đã lưu, mới nhất trước, và xoá được từng lượt. Lượt tìm của người khác MUST
được trả lời như không có.

#### Scenario: Xoá lượt tìm của mình

- **WHEN** người dùng xoá một lượt tìm của mình
- **THEN** response có HTTP 204 và lượt tìm không còn trong danh sách

#### Scenario: Xoá lượt tìm của người khác

- **WHEN** người dùng xoá một lượt tìm do người khác lưu
- **THEN** response có HTTP 404 `NOT_FOUND` và lượt tìm đó vẫn còn

### Requirement: Báo khi có tin mới khớp lượt tìm

Khi một tin lần đầu hiện ở mức đầy đủ trên sàn chung, mỗi người có lượt tìm đã lưu khớp tin đó SHALL được báo trong nhóm
thông báo "tìm kiếm đã lưu". Tin khớp khi tiêu đề hoặc mô tả chứa từ khoá (bỏ dấu, không phân biệt hoa thường) và tin nằm
trong mọi bộ lọc của lượt tìm. Báo gộp theo lượt tìm, nhắc tối đa mỗi 120 phút (giá trị khởi đầu).

#### Scenario: Tin mới khớp

- **WHEN** người dùng đã lưu lượt tìm "samsung" và một tin "Samsung Galaxy S21" của người khác lần đầu hiện đầy đủ trên
  sàn chung
- **THEN** người dùng có một thông báo nhóm "tìm kiếm đã lưu" về lượt tìm "samsung"

#### Scenario: Ba tin khớp trước khi đọc

- **WHEN** ba tin khớp cùng một lượt tìm lần lượt hiện và người dùng chưa đọc thông báo
- **THEN** hộp thư có một dòng cho lượt tìm đó ghi 3 tin mới, không phải ba dòng

#### Scenario: Ngoài bộ lọc

- **WHEN** lượt tìm "samsung" lọc tỉnh Hà Nội và một tin khớp từ khoá ở tỉnh khác hiện đầy đủ
- **THEN** người lưu không được báo

### Requirement: Tin không được báo cho lượt tìm đã lưu

Người đăng MUST NOT được báo về tin của chính mình. Tin chỉ hiện ở mức hạn chế, tin trong nhóm, và tin hiện lại sau khi
sửa, gia hạn hay hết tạm ẩn MUST NOT sinh thông báo "tìm kiếm đã lưu".

#### Scenario: Tin hạn chế

- **WHEN** tin khớp lượt tìm chỉ hiện ở mức hạn chế
- **THEN** người lưu không được báo

#### Scenario: Tin của chính mình

- **WHEN** người lưu lượt tìm đăng một tin khớp lượt tìm đó
- **THEN** người đó không được báo về tin của mình

#### Scenario: Tin hiện lại sau tạm ẩn

- **WHEN** một tin khớp lượt tìm đã hiện từ trước, bị tạm ẩn rồi hiện lại
- **THEN** người lưu không được báo lần nữa

### Requirement: Xoá tài khoản bỏ mọi lượt tìm đã lưu

Khi một tài khoản bị xoá, mọi lượt tìm tài khoản đó đã lưu SHALL bị bỏ và MUST NOT còn sinh thông báo.

#### Scenario: Tài khoản bị xoá

- **WHEN** người đã lưu lượt tìm xoá tài khoản, rồi một tin khớp hiện đầy đủ
- **THEN** không còn lượt tìm nào của tài khoản đó và không thông báo nào được tạo cho tài khoản đó
