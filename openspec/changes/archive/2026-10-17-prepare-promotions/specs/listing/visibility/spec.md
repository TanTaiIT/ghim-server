## ADDED Requirements

### Requirement: Vị trí trên bảng tin

Mỗi tin đã lên bảng SHALL có một vị trí xếp hạng riêng, đặt lúc tin lên bảng lần đầu; tin trùng tin cũ của chính người
đăng SHALL kế thừa vị trí của tin cũ (`screening/machine-decision`). Bảng tin sàn chung, danh mục, bảng tin nhóm và các
trang kế tiếp SHALL xếp theo vị trí này, mới trước. Sửa, gia hạn, chuyển trạng thái MUST NOT đổi vị trí
(`listing/display-period`); chưa có gói đẩy tin (TK 29) thì không thao tác nào đổi được vị trí.

#### Scenario: Hai tin lên bảng kế nhau

- **WHEN** tin A lên bảng rồi tin B cùng danh mục lên bảng sau
- **THEN** bảng tin và danh mục xếp B trên A

#### Scenario: Trang kế tiếp

- **WHEN** khách xem bảng tin có nhiều tin hơn một trang rồi mở trang kế tiếp bằng con trỏ
- **THEN** trang kế tiếp gồm đúng các tin đứng sau tin cuối của trang trước theo vị trí, không lặp, không sót

#### Scenario: Tin trùng của chính mình

- **WHEN** người đăng đăng lại một tin trùng tin cũ của mình và máy cho qua
- **THEN** tin mới đứng ở vị trí của tin cũ, không đứng trên các tin lên bảng sau tin cũ

### Requirement: Hạn nổi bật chưa dùng

Response của một tin SHALL có hạn nổi bật (`featuredUntil`), luôn trống tới khi có gói đẩy tin (TK 29) — app dựng dải
nổi bật từ đầu mà không cần đổi hợp đồng về sau.

#### Scenario: Chưa có gói nổi bật

- **WHEN** ai đó mở một tin đang hiển thị
- **THEN** response có `featuredUntil` là null
