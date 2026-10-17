## MODIFIED Requirements

### Requirement: Vị trí trên bảng tin

Mỗi tin đã lên bảng SHALL có một vị trí xếp hạng riêng, đặt lúc tin lên bảng lần đầu; tin trùng tin cũ của chính người
đăng SHALL kế thừa vị trí của tin cũ. Bảng tin sàn chung, danh mục, bảng tin nhóm và các trang kế tiếp SHALL xếp theo vị
trí này, mới trước. Sửa, gia hạn, chuyển trạng thái MUST NOT đổi vị trí; gói `rank_to_top` (`promotion/purchase`) là
đường duy nhất đặt lại vị trí, bằng lúc mua, và MUST NOT đổi mốc lên bảng lần đầu của tin.

#### Scenario: Hai tin lên bảng kế nhau

- **WHEN** tin A lên bảng rồi tin B cùng danh mục lên bảng sau
- **THEN** bảng tin và danh mục xếp B trên A

#### Scenario: Trang kế tiếp

- **WHEN** khách xem bảng tin có nhiều tin hơn một trang rồi mở trang kế tiếp bằng con trỏ
- **THEN** trang kế tiếp gồm đúng các tin đứng sau tin cuối của trang trước theo vị trí, không lặp, không sót

#### Scenario: Tin trùng của chính mình

- **WHEN** người đăng đăng lại một tin trùng tin cũ của mình và máy cho qua
- **THEN** tin mới đứng ở vị trí của tin cũ, không đứng trên các tin lên bảng sau tin cũ

#### Scenario: Đẩy lên đầu

- **WHEN** người đăng mua gói `rank_to_top` cho tin A đang hiển thị đầy đủ
- **THEN** A đứng trên mọi tin lên bảng trước lúc mua, mốc lên bảng lần đầu của A không đổi

### Requirement: Hạn nổi bật chưa dùng

Response của một tin SHALL có hạn nổi bật (`featuredUntil`): trống khi tin không có gói nổi bật, là lúc hết hạn khi gói
`featured` đang chạy.

#### Scenario: Không có gói

- **WHEN** ai đó mở một tin chưa từng mua gói nổi bật
- **THEN** response có `featuredUntil` là null

#### Scenario: Đang nổi bật

- **WHEN** ai đó mở một tin đang có gói nổi bật tới ngày D
- **THEN** response có `featuredUntil` là ngày D

## ADDED Requirements

### Requirement: Tin nổi bật

Tin còn hạn nổi bật và đang hiển thị đầy đủ SHALL vào dải "Tin nổi bật" ở đầu bảng tin sàn chung, danh mục và bảng tin
nhóm (theo phạm vi của tin), tối đa N tin mỗi dải (giá trị khởi đầu), xoay vòng để tin gần hết hạn lên trước. Tin tạm ẩn
hay hiển thị hạn chế MUST NOT vào dải dù còn hạn; hết hạn thì tin rời dải trong vòng một giờ và vẫn ở nguyên vị trí xếp
hạng.

#### Scenario: Còn hạn nhưng bị tạm ẩn

- **WHEN** tin có hạn nổi bật còn 3 ngày bị tạm ẩn vì nhóm bị khoá
- **THEN** tin không có trong dải nổi bật tới khi nhóm mở khoá

#### Scenario: Hết hạn

- **WHEN** hạn nổi bật của tin vừa qua
- **THEN** chậm nhất một giờ sau tin rời dải, và vị trí của tin trên bảng tin không đổi
