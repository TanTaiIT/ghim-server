## Purpose

Giới hạn một người được có bao nhiêu tin cùng lúc và gửi bao nhiêu lượt mỗi giờ theo mức tin cậy, đếm chung
mọi nơi đăng, để tài khoản mới không đăng hàng loạt và không ai lách được nhịp gửi (TK 20, cam kết 18).

## ADDED Requirements

### Requirement: Trần tin sống theo mức

Người dùng SHALL có tối đa số tin sống theo mức: T0 10, T1 20, T2 50, T3 100 (giá trị khởi đầu). Khi đã chạm
trần, thao tác của người đăng làm tăng số tin sống — gửi tin mới, gia hạn tin đã hết hạn, gửi lại tin bị từ
chối hay bị gỡ — MUST bị từ chối, và tin không đổi trạng thái. Gia hạn sớm một tin đang hiển thị không làm tăng
số tin sống nên SHALL không cần thêm chỗ.

#### Scenario: Gia hạn sớm khi đúng bằng trần

- **WHEN** người dùng ở mức T1 có 20 tin sống gia hạn sớm một tin đang hiển thị còn 5 ngày
- **THEN** gia hạn được nhận và số tin sống vẫn là 20

#### Scenario: Còn chỗ

- **WHEN** người dùng ở mức T0 có 9 tin sống gửi một tin mới
- **THEN** tin được gửi

#### Scenario: Hết chỗ khi gửi tin mới

- **WHEN** người dùng ở mức T0 có 10 tin sống gửi một tin mới
- **THEN** response có HTTP 409 `LISTING_QUOTA_EXCEEDED` và tin vẫn là nháp

#### Scenario: Hết chỗ khi gia hạn tin đã hết hạn

- **WHEN** người dùng ở mức T1 có 20 tin sống gia hạn một tin đã hết hạn
- **THEN** response có HTTP 409 `LISTING_QUOTA_EXCEEDED` và tin vẫn ở trạng thái hết hạn

#### Scenario: Hết chỗ khi gửi lại tin bị từ chối

- **WHEN** người dùng ở mức T0 có 10 tin sống sửa một tin bị từ chối vì sai sót rồi gửi lại
- **THEN** response có HTTP 409 `LISTING_QUOTA_EXCEEDED` và tin vẫn ở trạng thái bị từ chối

### Requirement: Tin sống gồm những gì

Tin sống SHALL gồm tin đang hiển thị không bị tạm ẩn, tin đang kiểm và tin chờ duyệt, đếm chung sàn chung và
mọi nhóm. Nháp, tin tạm ẩn, tin đã bán, hết hạn, bị từ chối, bị gỡ MUST NOT được tính vào tin sống.

#### Scenario: Đếm chung mọi nơi

- **WHEN** người dùng ở mức T0 có 4 tin đang hiển thị trên sàn chung, 3 tin ở nhóm A, 3 tin ở nhóm B, rồi gửi
  một tin vào nhóm C
- **THEN** response có HTTP 409 `LISTING_QUOTA_EXCEEDED`

#### Scenario: Tin chờ duyệt chiếm chỗ

- **WHEN** người dùng ở mức T0 có 9 tin đang hiển thị và 1 tin chờ duyệt gửi một tin mới
- **THEN** response có HTTP 409 `LISTING_QUOTA_EXCEEDED`

#### Scenario: Tin tạm ẩn không chiếm chỗ

- **WHEN** người dùng ở mức T0 có 9 tin đang hiển thị và 3 tin tạm ẩn vì nhóm bị khoá gửi một tin mới
- **THEN** tin được gửi

#### Scenario: Tin đã xong không chiếm chỗ

- **WHEN** người dùng ở mức T0 có 9 tin đang hiển thị, 5 tin đã bán, 5 tin hết hạn và 3 nháp gửi một tin mới
- **THEN** tin được gửi

### Requirement: Nhịp gửi theo mức

Mỗi lượt tin qua máy duyệt do người đăng khởi động — gửi tin mới, gửi lại sau khi sửa, sửa tin phải qua máy
lại, gia hạn — SHALL đếm là một lượt gửi. Trong một giờ gần nhất (cửa sổ trượt), người dùng có tối đa: T0 3,
T1 5, T2 10, T3 20 lượt (giá trị khởi đầu), đếm chung mọi nơi. Lượt bị từ chối, không qua máy, MUST NOT được
đếm.

#### Scenario: Hết lượt gửi

- **WHEN** người dùng ở mức T0 đã có 3 lượt gửi trong một giờ gần nhất và gửi một tin mới
- **THEN** response có HTTP 429 `SUBMISSION_RATE_LIMITED` kèm thời điểm được gửi lại, và tin vẫn là nháp

#### Scenario: Sửa đi sửa lại để lách nhịp

- **WHEN** người dùng ở mức T0 đã hết lượt gửi trong giờ và sửa giá một tin đang hiển thị
- **THEN** response có HTTP 429 `SUBMISSION_RATE_LIMITED` và tin giữ nguyên nội dung cũ

#### Scenario: Sửa không phải qua máy lại

- **WHEN** người dùng ở mức T0 đã hết lượt gửi trong giờ và bật "có thương lượng" cho một tin đang hiển thị
- **THEN** thay đổi được lưu và không tính là lượt gửi

#### Scenario: Lượt cũ trôi khỏi cửa sổ

- **WHEN** người dùng ở mức T0 có 3 lượt gửi, lượt sớm nhất đã qua hơn một giờ, và gửi một tin mới
- **THEN** tin được gửi

#### Scenario: Lượt bị từ chối không tính

- **WHEN** người dùng ở mức T0 có 2 lượt gửi trong giờ, gửi tiếp một tin và bị từ chối vì hết chỗ tin sống,
  rồi đánh dấu đã bán một tin và gửi lại
- **THEN** tin được gửi vì lượt bị từ chối không được đếm

### Requirement: Trần riêng của người ngoài trong một nhóm

Người ngoài gửi tin vào một nhóm SHALL chịu thêm trần riêng 2 tin sống trong nhóm đó (giá trị khởi đầu), ngoài
trần tin sống chung theo mức. Thành viên của nhóm MUST NOT chịu trần riêng này.

#### Scenario: Người ngoài gửi tin thứ ba vào một nhóm

- **WHEN** người ngoài có 2 tin sống trong nhóm X gửi thêm một tin vào nhóm X
- **THEN** response có HTTP 409 `OUTSIDER_QUOTA_EXCEEDED`

#### Scenario: Người ngoài gửi sang nơi khác

- **WHEN** người ngoài có 2 tin sống trong nhóm X, còn chỗ trong trần chung, gửi một tin lên sàn chung
- **THEN** tin được gửi

#### Scenario: Thành viên không chịu trần riêng

- **WHEN** một thành viên nhóm X có 2 tin sống trong nhóm X, còn chỗ trong trần chung, gửi thêm một tin vào
  nhóm X
- **THEN** tin được gửi

### Requirement: Vượt trần không gỡ tin đang sống

Khi số tin sống vượt trần — vì tụt mức, hay vì tin tạm ẩn hiện lại — mọi tin đang sống SHALL giữ nguyên. Người
dùng MUST NOT gửi tin mới hay gia hạn tin đã hết hạn tới khi số tin sống về dưới trần, và MUST NOT gia hạn sớm
tin nào khi số tin sống còn vượt trần.

#### Scenario: Tụt mức khi đang có nhiều tin

- **WHEN** người dùng ở mức T2 có 40 tin sống bị tính lại về T1
- **THEN** cả 40 tin vẫn hiển thị như cũ

#### Scenario: Gửi tin mới khi đang vượt trần

- **WHEN** người dùng ở mức T1 có 40 tin sống gửi một tin mới
- **THEN** response có HTTP 409 `LISTING_QUOTA_EXCEEDED`

#### Scenario: Gia hạn sớm khi đang vượt trần

- **WHEN** người dùng ở mức T1 có 40 tin sống gia hạn sớm một tin đang hiển thị ở 7 ngày cuối
- **THEN** response có HTTP 409 `LISTING_QUOTA_EXCEEDED` và ngày hết hạn của tin không đổi

#### Scenario: Về dưới trần

- **WHEN** người dùng ở mức T1 có 40 tin sống đánh dấu đã bán 21 tin rồi gửi một tin mới
- **THEN** tin được gửi

#### Scenario: Tin tạm ẩn hiện lại làm vượt trần

- **WHEN** người dùng ở mức T0 có 10 tin sống và 2 tin tạm ẩn vì nhóm bị khoá, rồi nhóm được mở khoá
- **THEN** cả 12 tin cùng hiển thị, và gửi tin mới nhận HTTP 409 `LISTING_QUOTA_EXCEEDED`

### Requirement: Hết chỗ thì báo tin nào đang chiếm chỗ

Lượt bị từ chối vì hết chỗ tin sống SHALL kèm danh sách tin đang chiếm chỗ — mỗi tin với trạng thái của nó —
và cách giải phóng chỗ: đánh dấu đã bán hoặc xoá tin cũ.

#### Scenario: Báo tin chiếm chỗ

- **WHEN** người dùng ở mức T0 có 8 tin đang hiển thị và 2 tin chờ duyệt gửi một tin mới
- **THEN** response có HTTP 409 `LISTING_QUOTA_EXCEEDED` liệt kê đủ 10 tin đang chiếm chỗ kèm trạng thái
  từng tin, cùng cách giải phóng chỗ
