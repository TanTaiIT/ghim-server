## Purpose

Chấm điểm rủi ro cho tin không thuộc diện luôn giữ, xếp điểm vào dải Thấp · Vừa · Cao, rồi quyết định hiện
đầy đủ, hiện hạn chế hay giữ cho người theo ma trận dải × mức tin cậy (TK 14, TK 15).

## ADDED Requirements

### Requirement: Điểm rủi ro là tổng trọng số các dấu hiệu trúng

Điểm rủi ro của một lượt qua máy SHALL là tổng trọng số của các dấu hiệu đang bật mà tin trúng. Tin không
trúng dấu hiệu nào có điểm 0.

#### Scenario: Không trúng dấu hiệu nào

- **WHEN** một tin không trúng dấu hiệu nào
- **THEN** điểm rủi ro là 0

#### Scenario: Trúng ba dấu hiệu

- **WHEN** một tin trúng "giá bất thường" (25), "chữ như gõ bừa" (30) và "liên hệ ngoài sàn" (20)
- **THEN** điểm rủi ro là 75

### Requirement: Ba dải rủi ro

Điểm SHALL được xếp vào dải Thấp nếu dưới 30, Vừa nếu từ 30 tới 59, Cao nếu từ 60 (giá trị khởi đầu). Master
SHALL đặt được ngưỡng riêng cho một danh mục; danh mục không có ngưỡng riêng dùng ngưỡng chung.

#### Scenario: Ranh giới các dải

- **WHEN** bốn tin của danh mục dùng ngưỡng chung có điểm 29, 30, 59 và 60
- **THEN** chúng lần lượt ở dải Thấp, Vừa, Vừa và Cao

#### Scenario: Danh mục có ngưỡng riêng

- **WHEN** master đặt cho danh mục Điện thoại ngưỡng dải Vừa từ 20, rồi một tin Điện thoại có điểm 25
- **THEN** tin ở dải Vừa, còn một tin điểm 25 ở danh mục dùng ngưỡng chung vẫn ở dải Thấp

#### Scenario: Ngưỡng sai thứ tự

- **WHEN** master đặt cho một danh mục ngưỡng dải Vừa cao hơn ngưỡng dải Cao
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và ngưỡng của danh mục không đổi

#### Scenario: Staff đổi ngưỡng

- **WHEN** một staff đổi ngưỡng dải của danh mục mình được giao
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Ma trận cho mức T0

Với tài khoản T0, dải Thấp SHALL cho hiện đầy đủ nếu tin đăng ở mức "chỉ thành viên" của một nhóm, và hiện
hạn chế nếu tin đăng ra nơi công khai (sàn chung, nhóm công khai). Dải Vừa và dải Cao SHALL giữ cho người.

#### Scenario: T0 đăng sàn chung, dải Thấp

- **WHEN** tài khoản T0 gửi lên sàn chung một tin có điểm 0
- **THEN** kết quả máy là hiện hạn chế, và tin không mang lý do hạn chế "máy"

#### Scenario: T0 đăng nhóm công khai, dải Thấp

- **WHEN** tài khoản T0 gửi vào nhóm, ở mức "nhóm công khai", một tin có điểm 20
- **THEN** kết quả máy là hiện hạn chế

#### Scenario: T0 đăng "chỉ thành viên", dải Thấp

- **WHEN** tài khoản T0 gửi vào nhóm, ở mức "chỉ thành viên", một tin có điểm 0
- **THEN** kết quả máy là hiện đầy đủ

#### Scenario: Tài khoản 2 ngày tuổi ghi số Zalo trong mô tả

- **WHEN** tài khoản T0 2 ngày tuổi gửi lên sàn chung một tin ghi số Zalo trong mô tả, không trúng gì khác
- **THEN** điểm là 30 (tài khoản mới 10, liên hệ ngoài sàn 20), dải Vừa, và kết quả máy là giữ cho người

### Requirement: Ma trận cho mức T1

Với tài khoản T1, dải Thấp SHALL cho hiện đầy đủ; dải Vừa SHALL cho hiện hạn chế và gắn lý do hạn chế "máy"
cho tin; dải Cao SHALL giữ cho người.

#### Scenario: T1 dải Thấp

- **WHEN** tài khoản T1 gửi lên sàn chung một tin có điểm 20
- **THEN** kết quả máy là hiện đầy đủ

#### Scenario: T1 dải Vừa

- **WHEN** tài khoản T1 gửi lên sàn chung một tin có điểm 45
- **THEN** kết quả máy là hiện hạn chế và tin mang lý do hạn chế "máy"

#### Scenario: iPhone 15 giá 2 triệu

- **WHEN** tài khoản T1 gửi tin iPhone 15 giá 2 triệu, mô tả lộn xộn, ghi số Zalo — trúng "giá bất thường",
  "chữ như gõ bừa" và "liên hệ ngoài sàn"
- **THEN** điểm là 75, dải Cao, và kết quả máy là giữ cho người

### Requirement: Ma trận cho mức T2 và T3

Với tài khoản T2 và T3, dải Thấp và dải Vừa SHALL cho hiện đầy đủ; dải Cao SHALL giữ cho người — kể cả với
T3, vì tài khoản uy tín bị chiếm là kịch bản đắt nhất.

#### Scenario: Tai nghe 1,2 triệu của tài khoản T2

- **WHEN** tài khoản T2 gửi tin tai nghe giá 1,2 triệu không trúng dấu hiệu nào
- **THEN** điểm là 0 và kết quả máy là hiện đầy đủ

#### Scenario: T2 dải Vừa

- **WHEN** tài khoản T2 gửi một tin có điểm 45
- **THEN** kết quả máy là hiện đầy đủ, và tin không mang lý do hạn chế "máy"

#### Scenario: T3 dải Cao

- **WHEN** tài khoản T3 gửi một tin có điểm 60
- **THEN** kết quả máy là giữ cho người

### Requirement: Dấu hiệu chữ như gõ bừa

Tin mà phần lớn tiêu đề và mô tả không phải chữ có nghĩa SHALL trúng dấu hiệu "chữ như gõ bừa", 30 điểm (giá
trị khởi đầu).

#### Scenario: Mô tả gõ bừa

- **WHEN** tiêu đề và mô tả của tin là một chuỗi ký tự gõ bừa, không thành chữ có nghĩa
- **THEN** tin trúng "chữ như gõ bừa" và được cộng 30 điểm

#### Scenario: Mô tả bình thường

- **WHEN** tiêu đề và mô tả của tin là câu tiếng Việt có nghĩa
- **THEN** tin không trúng "chữ như gõ bừa"

### Requirement: Dấu hiệu giá 0 ở danh mục giá trị cao

Tin giá 0 (cho tặng) thuộc danh mục có giá tham chiếu cao — mặc định trên 2 triệu (giá trị khởi đầu) — SHALL
trúng dấu hiệu "giá 0 ở danh mục giá trị cao", 30 điểm (giá trị khởi đầu).

#### Scenario: Cho tặng điện thoại

- **WHEN** danh mục Điện thoại có giá tham chiếu 8 triệu và một tin trong đó đặt giá 0
- **THEN** tin trúng "giá 0 ở danh mục giá trị cao" và được cộng 30 điểm

#### Scenario: Cho tặng quần áo

- **WHEN** danh mục Quần áo có giá tham chiếu 300 nghìn và một tin trong đó đặt giá 0
- **THEN** tin không trúng dấu hiệu này

### Requirement: Dấu hiệu giá bất thường

Giá nằm ngoài khoảng thường thấy của các tin cùng danh mục trong 90 ngày (giá trị khởi đầu) SHALL trúng dấu
hiệu "giá bất thường", 25 điểm (giá trị khởi đầu). Danh mục chưa đủ 30 tin để so (giá trị khởi đầu) thì
không xét. Giá 0 MUST NOT bị coi là giá bất thường (cam kết 29).

#### Scenario: Giá lệch xa ở danh mục đủ mẫu

- **WHEN** danh mục có 200 tin trong 90 ngày, phần lớn giá từ 5 tới 20 triệu, và một tin mới đặt giá 2 triệu
- **THEN** tin trúng "giá bất thường" và được cộng 25 điểm

#### Scenario: Danh mục chưa đủ mẫu

- **WHEN** danh mục chỉ có 12 tin trong 90 ngày và một tin mới đặt giá lệch xa các tin đó
- **THEN** tin không trúng "giá bất thường"

#### Scenario: Giá 0

- **WHEN** một tin đặt giá 0 ở danh mục đủ mẫu
- **THEN** tin không trúng "giá bất thường"

### Requirement: Dấu hiệu liên hệ ngoài sàn

Tin có số điện thoại, Zalo hoặc đường link nằm trong mô tả SHALL trúng dấu hiệu "liên hệ ngoài sàn", 20 điểm
(giá trị khởi đầu). Số điện thoại người đăng để trên hồ sơ MUST NOT làm tin trúng dấu hiệu này.

#### Scenario: Số Zalo trong mô tả

- **WHEN** mô tả của tin ghi "Zalo 0912 345 678"
- **THEN** tin trúng "liên hệ ngoài sàn" và được cộng 20 điểm

#### Scenario: Số điện thoại để trên hồ sơ

- **WHEN** người đăng có số điện thoại trên hồ sơ và mô tả của tin không có số, Zalo hay đường link nào
- **THEN** tin không trúng "liên hệ ngoài sàn"

### Requirement: Dấu hiệu trùng tin của chính mình

Tin gần như y hệt một tin khác của cùng người đăng — kể cả tin đã xoá hay đã hết hạn trong 30 ngày (giá trị
khởi đầu) — SHALL trúng dấu hiệu "trùng tin của chính mình", 20 điểm (giá trị khởi đầu). Tin trùng được lên
bảng thì SHALL giữ vị trí của tin cũ, MUST NOT được đẩy lên đầu bảng tin.

#### Scenario: Đăng lại tin vừa xoá

- **WHEN** người đăng xoá một tin rồi 10 ngày sau gửi một tin gần như y hệt
- **THEN** tin mới trúng "trùng tin của chính mình", được cộng 20 điểm, và nếu được lên bảng thì nằm ở vị
  trí của tin cũ chứ không ở đầu bảng tin

#### Scenario: Tin cũ đã xoá quá 30 ngày

- **WHEN** người đăng gửi lại một tin gần như y hệt tin mình đã xoá 40 ngày trước, và không còn tin nào khác
  giống nó
- **THEN** tin mới không trúng "trùng tin của chính mình"

### Requirement: Dấu hiệu đăng dồn

Tài khoản T0 hoặc T1 có hơn 10 lượt gửi trong 24 giờ, hay tài khoản T2 hoặc T3 có hơn 30 lượt (giá trị khởi
đầu), SHALL trúng dấu hiệu "đăng dồn", 20 điểm (giá trị khởi đầu). Gửi lại sau khi sửa cũng là một lượt gửi.

#### Scenario: Lượt gửi thứ 11 của T1

- **WHEN** tài khoản T1 đã có 10 lượt gửi trong 24 giờ qua và gửi lượt thứ 11
- **THEN** lượt thứ 11 trúng "đăng dồn" và được cộng 20 điểm

#### Scenario: Lượt gửi thứ 10 của T1

- **WHEN** tài khoản T1 đã có 9 lượt gửi trong 24 giờ qua và gửi lượt thứ 10
- **THEN** lượt đó không trúng "đăng dồn"

#### Scenario: Gửi lại sau khi sửa được đếm

- **WHEN** tài khoản T1 có 6 lượt gửi tin mới và 4 lượt gửi lại sau khi sửa trong 24 giờ qua, rồi gửi thêm
  một lượt
- **THEN** lượt đó trúng "đăng dồn"

#### Scenario: Lượt gửi thứ 25 của T2

- **WHEN** tài khoản T2 đã có 24 lượt gửi trong 24 giờ qua và gửi lượt thứ 25
- **THEN** lượt đó không trúng "đăng dồn"

### Requirement: Dấu hiệu danh mục rủi ro cao

Tin thuộc danh mục có mức rủi ro cao SHALL trúng dấu hiệu "danh mục rủi ro cao", 20 điểm (giá trị khởi đầu),
rồi được xếp dải và đi ma trận như mọi tin. Mức rủi ro thấp hay vừa MUST NOT làm tin trúng dấu hiệu này. Mức
rủi ro cao MUST NOT tự nó giữ tin — chỉ danh mục bật "luôn duyệt tay" mới giữ mọi tin (TK 11, TK 14).

#### Scenario: Tài khoản T2 đăng vào danh mục rủi ro cao

- **WHEN** danh mục Đồng hồ có mức rủi ro cao, không bật luôn duyệt tay, và tài khoản T2 gửi vào đó một tin
  không trúng dấu hiệu nào khác
- **THEN** tin trúng "danh mục rủi ro cao", điểm là 20, dải Thấp, và kết quả máy là hiện đầy đủ

#### Scenario: Cộng với dấu hiệu khác

- **WHEN** tài khoản T1 gửi vào danh mục Đồng hồ (rủi ro cao, không bật luôn duyệt tay) một tin ghi số Zalo
  trong mô tả, không trúng gì khác
- **THEN** điểm là 40 (danh mục rủi ro cao 20, liên hệ ngoài sàn 20), dải Vừa, và kết quả máy là hiện hạn
  chế với lý do hạn chế "máy"

#### Scenario: Danh mục rủi ro vừa

- **WHEN** danh mục Xe máy có mức rủi ro vừa và một tin trong đó không trúng dấu hiệu nào khác
- **THEN** tin không trúng "danh mục rủi ro cao" và điểm là 0

### Requirement: Dấu hiệu bị giữ nhiều

Tài khoản đã bị máy giữ từ 3 lần trong 7 ngày gần nhất (giá trị khởi đầu) SHALL trúng dấu hiệu "bị giữ
nhiều", 15 điểm (giá trị khởi đầu).

#### Scenario: Ba lần bị giữ trong 7 ngày

- **WHEN** máy đã giữ 3 tin của một tài khoản trong 7 ngày qua và tài khoản đó gửi tin mới
- **THEN** tin mới trúng "bị giữ nhiều" và được cộng 15 điểm

#### Scenario: Hai lần bị giữ

- **WHEN** máy đã giữ 2 tin của một tài khoản trong 7 ngày qua và tài khoản đó gửi tin mới
- **THEN** tin mới không trúng "bị giữ nhiều"

### Requirement: Dấu hiệu sai danh mục

Khi máy suy ra danh mục thật của tin khác danh mục người đăng đã chọn, tin SHALL trúng dấu hiệu "sai danh
mục", 15 điểm (giá trị khởi đầu). Danh mục suy ra có mức rủi ro cao hay bật "luôn duyệt tay" thì tin SHALL bị
xét theo luật của danh mục đó: rủi ro cao thì trúng thêm "danh mục rủi ro cao", luôn duyệt tay thì giữ cho
người (TK 14).

#### Scenario: Điện thoại đăng vào Quần áo

- **WHEN** người đăng chọn danh mục Quần áo cho một tin bán điện thoại
- **THEN** tin trúng "sai danh mục" và được cộng 15 điểm

#### Scenario: Thú cưng đăng vào Đồ gia dụng

- **WHEN** danh mục Thú cưng bật luôn duyệt tay và người đăng chọn danh mục Đồ gia dụng cho một tin bán thú
  cưng
- **THEN** tin trúng "sai danh mục" và bị giữ cho người như mọi tin của danh mục luôn duyệt tay

#### Scenario: Suy ra danh mục rủi ro cao

- **WHEN** danh mục Đồng hồ có mức rủi ro cao, không bật luôn duyệt tay, và tài khoản T2 chọn danh mục Quần
  áo, rủi ro thấp, cho một tin bán đồng hồ không trúng gì khác
- **THEN** tin trúng "sai danh mục" (15) và "danh mục rủi ro cao" (20), điểm là 35 và dải Vừa

### Requirement: Dấu hiệu tài khoản mới

Tài khoản dưới 3 ngày tuổi (giá trị khởi đầu) SHALL trúng dấu hiệu "tài khoản mới", 10 điểm (giá trị khởi
đầu).

#### Scenario: Tài khoản 2 ngày tuổi

- **WHEN** tài khoản 2 ngày tuổi gửi tin
- **THEN** tin trúng "tài khoản mới" và được cộng 10 điểm

#### Scenario: Tài khoản 4 ngày tuổi

- **WHEN** tài khoản 4 ngày tuổi gửi tin
- **THEN** tin không trúng "tài khoản mới"

### Requirement: Dấu hiệu dùng chung máy với tài khoản bị khoá

Tài khoản dùng chung máy với một tài khoản đang bị khoá, mà không thuộc diện luôn giữ theo thiết bị (đã đăng
tin trên máy từ trước lúc khoá), SHALL trúng dấu hiệu "trùng thiết bị với tài khoản bị khoá", 30 điểm (giá
trị khởi đầu).

#### Scenario: Người nhà đã đăng tin từ trước

- **WHEN** tài khoản B đã đăng tin trên một máy trước khi tài khoản A cùng máy bị khoá, rồi B gửi tin mới
- **THEN** tin của B trúng "trùng thiết bị với tài khoản bị khoá", được cộng 30 điểm, và được chấm theo ma
  trận chứ không luôn giữ

#### Scenario: Tài khoản kia đã được mở khoá

- **WHEN** A được mở khoá rồi B gửi tin mới
- **THEN** tin của B không trúng dấu hiệu này
