## MODIFIED Requirements

### Requirement: Vị trí trên bảng tin

Mỗi tin đã lên bảng SHALL có một vị trí xếp hạng riêng, đặt lúc tin lên bảng lần đầu; tin trùng tin cũ của chính người
đăng SHALL kế thừa vị trí của tin cũ. Bảng tin sàn chung, danh mục, bảng tin nhóm và các trang kế tiếp SHALL xếp theo vị
trí này, mới trước, khi người xem không chọn cách xếp khác. Sửa, gia hạn, chuyển trạng thái MUST NOT đổi vị trí; chỉ "đẩy
lên đầu" — của người quản trị (`listing/boosting`) hay gói `rank_to_top` (`promotion/purchase`) — đặt lại vị trí về lúc
đẩy, và MUST NOT đổi mốc lên bảng lần đầu.

#### Scenario: Hai tin lên bảng kế nhau

- **WHEN** tin A lên bảng rồi tin B cùng danh mục lên bảng sau
- **THEN** bảng tin và danh mục xếp B trên A

#### Scenario: Trang kế tiếp

- **WHEN** khách xem bảng tin có nhiều tin hơn một trang rồi mở trang kế tiếp bằng con trỏ
- **THEN** trang kế tiếp gồm đúng các tin đứng sau tin cuối của trang trước theo vị trí, không lặp, không sót

#### Scenario: Tin trùng của chính mình

- **WHEN** người đăng đăng lại một tin trùng tin cũ của mình và máy cho qua
- **THEN** tin mới đứng ở vị trí của tin cũ, không đứng trên các tin lên bảng sau tin cũ

#### Scenario: Tin được đẩy lên đầu

- **WHEN** tin A lên bảng trước tin B, rồi người quản trị đẩy A lên đầu
- **THEN** bảng tin xếp A trên B, và trang kế tiếp mở bằng con trỏ cũ không lặp A

#### Scenario: Gia hạn không đẩy tin

- **WHEN** người đăng gia hạn sớm tin A đang đứng dưới tin B
- **THEN** A vẫn đứng dưới B

#### Scenario: Người đăng mua gói đẩy lên đầu

- **WHEN** người đăng mua gói `rank_to_top` cho tin A đang hiển thị đầy đủ
- **THEN** A đứng trên mọi tin lên bảng trước lúc mua, mốc lên bảng lần đầu của A không đổi

### Requirement: Hạn nổi bật của một tin

Response của một tin SHALL có hạn nổi bật (`featuredUntil`): thời điểm tin hết nổi bật khi tin đang nổi bật — do người
quản trị đặt (`listing/boosting`) hay gói `featured` đang chạy — và null khi tin chưa từng nổi bật, đã bị bỏ nổi bật hay
hạn đã qua.

#### Scenario: Tin đang nổi bật

- **WHEN** ai đó mở một tin được đặt nổi bật 7 ngày từ hôm qua
- **THEN** response có `featuredUntil` = 6 ngày nữa

#### Scenario: Hạn đã qua

- **WHEN** ai đó mở một tin có hạn nổi bật đã qua
- **THEN** response có `featuredUntil` là null

#### Scenario: Gói nổi bật đang chạy

- **WHEN** ai đó mở một tin đang có gói nổi bật tới ngày D
- **THEN** response có `featuredUntil` là ngày D
