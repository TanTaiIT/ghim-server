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

### Requirement: Dải tin nổi bật

Dải "Tin nổi bật" SHALL có cho bảng tin sàn chung (mọi danh mục hoặc một danh mục) và cho bảng tin từng nhóm: gồm các tin
có hạn nổi bật chưa qua mà người xem thấy được trên đúng bảng tin đó, tối đa `promotion.featuredStripSize` tin (giá trị
khởi đầu 6). Có nhiều tin nổi bật hơn trần thì mỗi lần tải SHALL lấy ngẫu nhiên đủ trần trong số đó, để tin nào cũng được
hiện một phần thời gian thay vì tin mua sau phải chờ tin khác hết hạn (chốt 28/10/2026). Tin trong dải MUST vẫn ở chỗ của
nó trong bảng tin.

#### Scenario: Tin sàn chung nổi bật

- **WHEN** staff đặt nổi bật một tin sàn chung thuộc "Xe cộ"
- **THEN** tin có trong dải của bảng tin sàn chung và dải của danh mục "Xe cộ", không có trong dải của danh mục khác

#### Scenario: Tin nhóm nổi bật

- **WHEN** chủ nhóm đặt nổi bật một tin "chỉ thành viên" của nhóm
- **THEN** thành viên thấy tin trong dải của nhóm; khách và người ngoài nhóm không thấy; dải sàn chung không có tin

#### Scenario: Hơn 6 tin nổi bật

- **WHEN** bảng tin sàn chung có 8 tin đang nổi bật
- **THEN** mỗi lần tải dải có đúng 6 tin khác nhau lấy ngẫu nhiên trong 8 tin đó, và qua nhiều lần tải cả 8 tin đều xuất hiện

#### Scenario: Tin nổi bật bị hạn chế rồi trở lại

- **WHEN** một tin đang nổi bật bị đặt lý do hạn chế "gậy", rồi lý do được gỡ khi hạn nổi bật còn
- **THEN** tin rời dải trong lúc hạn chế và có lại trong dải sau khi gỡ

#### Scenario: Hết hạn nổi bật

- **WHEN** hạn nổi bật của một tin vừa qua
- **THEN** tin không còn trong dải mà không cần thao tác nào, và vẫn ở chỗ cũ trong bảng tin

#### Scenario: Không có tin nổi bật

- **WHEN** khách mở dải của một nhóm không có tin nào nổi bật
- **THEN** server trả danh sách rỗng
