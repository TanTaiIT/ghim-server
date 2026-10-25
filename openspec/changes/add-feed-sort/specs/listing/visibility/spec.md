## MODIFIED Requirements

### Requirement: Vị trí trên bảng tin

Mỗi tin đã lên bảng SHALL có một vị trí xếp hạng riêng, đặt lúc tin lên bảng lần đầu; tin trùng tin cũ của chính người
đăng SHALL kế thừa vị trí của tin cũ (`screening/machine-decision`). Bảng tin sàn chung, danh mục, bảng tin nhóm và các
trang kế tiếp SHALL xếp theo vị trí này, mới trước, khi người xem không chọn cách xếp khác. Sửa, gia hạn, chuyển trạng thái
MUST NOT đổi vị trí (`listing/display-period`); chưa có gói đẩy tin (TK 29) thì không thao tác nào đổi được vị trí.

#### Scenario: Hai tin lên bảng kế nhau

- **WHEN** tin A lên bảng rồi tin B cùng danh mục lên bảng sau
- **THEN** bảng tin và danh mục xếp B trên A

#### Scenario: Trang kế tiếp

- **WHEN** khách xem bảng tin có nhiều tin hơn một trang rồi mở trang kế tiếp bằng con trỏ
- **THEN** trang kế tiếp gồm đúng các tin đứng sau tin cuối của trang trước theo vị trí, không lặp, không sót

#### Scenario: Tin trùng của chính mình

- **WHEN** người đăng đăng lại một tin trùng tin cũ của mình và máy cho qua
- **THEN** tin mới đứng ở vị trí của tin cũ, không đứng trên các tin lên bảng sau tin cũ

## ADDED Requirements

### Requirement: Sắp xếp theo giá

Bảng tin sàn chung, danh mục và tìm kiếm có từ khoá SHALL cho người xem chọn cách xếp: mới nhất (mặc định, theo vị trí
trên bảng tin), giá tăng dần, giá giảm dần. Xếp theo giá thì tin cùng giá SHALL xếp theo mã tin, và trang kế tiếp bằng con
trỏ MUST không lặp, không sót. Cách xếp không thuộc ba cách trên MUST bị từ chối.

#### Scenario: Giá tăng dần

- **WHEN** danh mục có ba tin giá 300.000, 100.000, 200.000 đồng và người xem chọn giá tăng dần
- **THEN** response có HTTP 200 với ba tin theo thứ tự 100.000, 200.000, 300.000

#### Scenario: Giá giảm dần, theo trang

- **WHEN** người xem chọn giá giảm dần với `limit=3` trên bốn tin, hai tin cùng giá, rồi mở trang kế tiếp bằng con trỏ
- **THEN** trang đầu có ba tin giá cao trước, trang sau có đúng tin còn lại và con trỏ rỗng

#### Scenario: Có từ khoá

- **WHEN** người xem tìm theo từ khoá và chọn giá tăng dần
- **THEN** kết quả tìm kiếm xếp theo giá tăng dần

#### Scenario: Cách xếp không có

- **WHEN** người xem gửi `sort=nearest`
- **THEN** response có HTTP 400 `VALIDATION_ERROR`
