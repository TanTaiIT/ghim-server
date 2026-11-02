## ADDED Requirements

### Requirement: Gợi ý theo hồ sơ quan tâm

Mục "Gợi ý cho bạn" của một người có lịch sử SHALL xếp tin theo mức khớp với hồ sơ quan tâm dựng từ hội thoại về tin,
tin đã lưu, tìm kiếm đã lưu, lịch sử tìm kiếm và lịch sử xem trong 90 ngày (danh mục, từ khoá, khoảng giá, tỉnh); nguồn
mạnh hơn (hội thoại, tin đã lưu) SHALL nặng hơn nguồn yếu (lượt xem). Response SHALL có cờ đã cá nhân hoá.

#### Scenario: Đã lưu nhiều xe máy

- **WHEN** A đã lưu ba tin xe máy ở Hồ Chí Minh và chỉ xem một tin điện thoại
- **THEN** mục gợi ý của A xếp tin xe máy mới ở Hồ Chí Minh trước tin điện thoại, với cờ đã cá nhân hoá

#### Scenario: Khớp từ khoá tìm kiếm

- **WHEN** A từng tìm "honda vision" và có một tin mới tiêu đề chứa "Honda Vision" ở danh mục khác danh mục A hay lưu
- **THEN** tin đó có trong mục gợi ý của A

### Requirement: Không gợi ý tin đã biết

Mục gợi ý MUST NOT có tin của chính người xem, tin người xem đã lưu hay đã mở hội thoại. Tin đã xem trong 7 ngày SHALL
được xếp thấp hơn tin chưa xem có cùng mức khớp.

#### Scenario: Tin đã lưu và đã hỏi

- **WHEN** A đã lưu tin X và đã nhắn hỏi tin Y, cả hai khớp hồ sơ của A
- **THEN** mục gợi ý của A không có X và Y

### Requirement: Chỉ tin hiển thị đầy đủ trên sàn chung

Mục gợi ý SHALL chỉ gồm tin trên sàn chung mà người xem thấy được ở mức hiển thị đầy đủ — theo cùng luật với bảng tin
sàn chung (`listing/visibility`).

#### Scenario: Tin hạn chế, tin chỉ trong nhóm

- **WHEN** một tin khớp hồ sơ của A đang hiển thị hạn chế, hay chỉ hiện cho thành viên một nhóm
- **THEN** tin đó không có trong mục gợi ý của A

### Requirement: Chưa có lịch sử — được quan tâm nhiều gần bạn

Với khách, người chưa có tín hiệu nào, hay người đã tắt "Gợi ý theo hoạt động", mục gợi ý SHALL gồm tin sàn chung hiển
thị đầy đủ trong tỉnh người xem chọn (trống là toàn quốc), xếp theo lượt lưu cộng hai lần lượt hỏi mua trong 14 ngày
qua, bằng nhau thì tin lên bảng mới hơn trước; response có cờ chưa cá nhân hoá.

#### Scenario: Khách ở Hồ Chí Minh

- **WHEN** khách mở mục gợi ý với tỉnh Hồ Chí Minh, tin P có 5 lượt lưu và tin Q có 1 lượt lưu trong 14 ngày qua
- **THEN** P đứng trước Q và cờ là chưa cá nhân hoá

#### Scenario: Thiếu tin khớp hồ sơ

- **WHEN** hồ sơ của A chỉ khớp 8 tin
- **THEN** trang đầu có 8 tin đó rồi tới tin được quan tâm nhiều gần A, không trùng tin

### Requirement: Trang kế tiếp

Mục gợi ý SHALL trả 20 tin mỗi trang kèm con trỏ trang kế; hết tin thì con trỏ rỗng.

#### Scenario: Trang thứ hai

- **WHEN** A mở trang kế bằng con trỏ của trang đầu
- **THEN** response có các tin xếp sau tin cuối của trang đầu

### Requirement: Dải tin nổi bật không đổi

Mục gợi ý MUST NOT thay đổi dải "Tin nổi bật" (`listing/visibility`, `promotion/purchase`): tin đang nổi bật vẫn có trong
dải theo luật cũ, và có thể xuất hiện thêm trong mục gợi ý nếu khớp.

#### Scenario: Tin đã mua gói nổi bật

- **WHEN** một tin đang chạy gói "Nổi bật 7 ngày"
- **THEN** dải "Tin nổi bật" vẫn có tin đó như trước change này
