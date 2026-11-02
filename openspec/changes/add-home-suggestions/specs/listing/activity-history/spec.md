## ADDED Requirements

### Requirement: Ghi lịch sử xem tin

Khi một người đã đăng nhập, đang bật "Gợi ý theo hoạt động", mở một tin xem được mà không phải tin của mình, server
SHALL ghi lượt xem đó vào lịch sử của người ấy: mỗi tin một dòng, mở lại thì tăng số lần và dời mốc lần cuối. Lỗi khi
ghi MUST NOT làm hỏng lượt mở tin.

#### Scenario: Mở tin của người khác

- **WHEN** người dùng A đang bật công tắc mở tin của B
- **THEN** lịch sử xem của A có tin đó với số lần 1

#### Scenario: Mở lại cùng tin

- **WHEN** A mở lại tin đó lần nữa
- **THEN** lịch sử xem của A vẫn chỉ một dòng cho tin đó, số lần 2, mốc lần cuối là lúc mở lại

#### Scenario: Tin của chính mình, khách

- **WHEN** A mở tin của chính A, hay một khách chưa đăng nhập mở tin của B
- **THEN** không có lượt xem nào được ghi

### Requirement: Ghi lịch sử tìm kiếm

Khi một người đã đăng nhập, đang bật công tắc, chạy trang đầu của một lượt tìm trên sàn chung có từ khoá hoặc ít nhất
một bộ lọc (danh mục, tỉnh, khoảng giá), server SHALL ghi lượt tìm đó: từ khoá đã gấp dấu và các bộ lọc. Lượt tìm trùng
y hệt lượt cuối trong 10 phút SHALL chỉ dời mốc của lượt cuối.

#### Scenario: Tìm có từ khoá

- **WHEN** A tìm "xe máy honda" ở tỉnh Hồ Chí Minh
- **THEN** lịch sử tìm kiếm của A có một lượt với từ khoá đã gấp dấu và tỉnh đó

#### Scenario: Cuộn trang kế, bảng tin không lọc

- **WHEN** A mở trang thứ hai của lượt tìm đó, hay mở bảng tin không từ khoá không bộ lọc
- **THEN** không có lượt tìm mới nào được ghi

#### Scenario: Tìm lại y hệt

- **WHEN** A chạy lại đúng lượt tìm đó sau 3 phút
- **THEN** lịch sử tìm kiếm của A vẫn một dòng cho lượt tìm đó, mốc là lúc tìm lại

### Requirement: Trần lịch sử mỗi người

Lịch sử của một người SHALL giữ tối đa 200 tin đã xem và 100 lượt tìm gần nhất; ghi thêm quá trần thì phần cũ nhất bị
xoá ngay lúc ghi.

#### Scenario: Xem tin thứ 201

- **WHEN** A đã có 200 tin trong lịch sử xem rồi mở một tin mới
- **THEN** lịch sử xem của A còn 200 tin, tin có mốc cũ nhất bị bỏ

### Requirement: Công tắc gợi ý theo hoạt động

Người dùng SHALL bật tắt được "Gợi ý theo hoạt động" (mặc định bật). Đang tắt thì server MUST NOT ghi lịch sử xem hay
tìm kiếm của người đó, và mục "Gợi ý cho bạn" SHALL trả như cho khách. Tắt MUST NOT xoá lịch sử đã có.

#### Scenario: Tắt công tắc

- **WHEN** A tắt công tắc rồi mở tin của B và tìm "tủ lạnh"
- **THEN** lịch sử của A không có thêm dòng nào, và mục gợi ý của A trả với cờ không cá nhân hoá

#### Scenario: Bật lại

- **WHEN** A bật lại công tắc
- **THEN** lịch sử cũ trước lúc tắt vẫn còn và gợi ý dùng lại nó

### Requirement: Xoá lịch sử

Người dùng SHALL xoá được toàn bộ lịch sử xem và tìm kiếm của mình bằng một thao tác. Tin đã lưu, tìm kiếm đã lưu và hội
thoại MUST NOT bị xoá theo.

#### Scenario: Xoá lịch sử

- **WHEN** A xoá lịch sử
- **THEN** lịch sử xem và tìm kiếm của A trống, tin đã lưu và tìm kiếm đã lưu của A còn nguyên

### Requirement: Lịch sử chỉ của chính mình

Lịch sử xem và tìm kiếm của một người MUST NOT được trả qua bất kỳ route nào cho người khác, kể cả staff và master; nó
chỉ dùng để dựng gợi ý cho chính người đó.

#### Scenario: Bàn vận hành

- **WHEN** master mở hồ sơ của A ở bàn vận hành
- **THEN** response không có lịch sử xem hay tìm kiếm của A
