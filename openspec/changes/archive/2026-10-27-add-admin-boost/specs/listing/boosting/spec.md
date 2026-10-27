# Spec Delta

## Purpose

Cho người quản trị — master, staff của danh mục, chủ nhóm và điều hành viên — đẩy một tin lên đầu bảng tin hay đặt nó
vào dải "Tin nổi bật" trong phạm vi mình quản lý, miễn phí, có thời gian chờ và có nhật ký.

## ADDED Requirements

### Requirement: Phạm vi đẩy tin theo vai

Đẩy lên đầu, đặt nổi bật, bỏ nổi bật SHALL chỉ dành cho: master với mọi tin; staff đang hoạt động với tin sàn chung
thuộc danh mục được giao; chủ nhóm và điều hành viên cả nhóm với tin của nhóm; điều hành viên đơn vị với tin thuộc đơn vị
mình. Vai đang treo hay nhóm không còn cho điều hành thì không tính. Người ngoài phạm vi MUST nhận 403 `FORBIDDEN`; tin
không có hay đã xoá MUST nhận 404 `NOT_FOUND`. Người quản trị được đẩy cả tin của chính mình.

#### Scenario: Master đẩy tin trong nhóm

- **WHEN** master đẩy lên đầu một tin đang hiển thị đầy đủ của một nhóm công khai
- **THEN** lượt đẩy thành công, tin đứng đầu bảng tin của nhóm đó

#### Scenario: Staff đẩy tin sàn chung của danh mục mình

- **WHEN** staff được giao danh mục "Xe cộ" đẩy lên đầu một tin sàn chung thuộc "Xe cộ"
- **THEN** lượt đẩy thành công

#### Scenario: Staff đẩy tin danh mục khác

- **WHEN** staff chỉ được giao danh mục "Xe cộ" đẩy một tin sàn chung thuộc "Điện thoại"
- **THEN** server trả 403 `FORBIDDEN` và tin không đổi

#### Scenario: Staff đẩy tin trong nhóm

- **WHEN** staff được giao "Xe cộ" đẩy một tin thuộc "Xe cộ" nhưng đăng trong một nhóm
- **THEN** server trả 403 `FORBIDDEN`

#### Scenario: Quyền staff đang bị treo

- **WHEN** staff có quyền đang bị treo vì nhận cảnh cáo đẩy một tin sàn chung thuộc danh mục từng được giao
- **THEN** server trả 403 `FORBIDDEN`

#### Scenario: Điều hành viên đơn vị khác

- **WHEN** điều hành viên của đơn vị A đẩy một tin của cùng nhóm nhưng thuộc đơn vị B
- **THEN** server trả 403 `FORBIDDEN`

#### Scenario: Chủ nhóm đẩy tin của chính mình

- **WHEN** chủ nhóm đẩy lên đầu tin của chính mình đăng trong nhóm đó
- **THEN** lượt đẩy thành công

#### Scenario: Quản trị nhóm với tin sàn chung mang huy hiệu nhóm

- **WHEN** chủ nhóm đẩy một tin sàn chung có dòng "Thành viên" của nhóm mình
- **THEN** server trả 403 `FORBIDDEN`

#### Scenario: Nhóm bị khoá

- **WHEN** chủ nhóm của một nhóm đang bị khoá đẩy một tin của nhóm
- **THEN** server trả 403 `FORBIDDEN`

#### Scenario: Người dùng thường

- **WHEN** một người dùng không giữ vai quản trị nào đẩy tin của người khác hay của chính mình
- **THEN** server trả 403 `FORBIDDEN`

#### Scenario: Tin đã xoá

- **WHEN** master đẩy một tin người đăng đã xoá
- **THEN** server trả 404 `NOT_FOUND`

#### Scenario: Chưa đăng nhập

- **WHEN** khách gọi đẩy tin không kèm phiên
- **THEN** server trả 401 `UNAUTHORIZED`

### Requirement: Chỉ đẩy tin đang hiển thị đầy đủ

Đẩy lên đầu và đặt nổi bật SHALL chỉ áp cho tin đang hiển thị ở mức đầy đủ, không tạm ẩn. Tin khác MUST bị từ chối
409 `BOOST_NOT_ALLOWED` với câu nói rõ vì sao (đang kiểm, chờ duyệt, bị gỡ, tạm ẩn, hiển thị hạn chế, đã bán, hết hạn).
Đẩy tin MUST NOT đổi trạng thái, cờ tạm ẩn, lý do hạn chế hay ngày hết hạn của tin (TK 27 cam kết 20).

#### Scenario: Tin chờ duyệt

- **WHEN** master đặt nổi bật một tin đang chờ người duyệt
- **THEN** server trả 409 `BOOST_NOT_ALLOWED` với câu "Tin đang chờ duyệt", tin vẫn chờ duyệt

#### Scenario: Tin hiển thị hạn chế

- **WHEN** staff đẩy lên đầu một tin trong danh mục mình đang hiển thị hạn chế vì "tài khoản mới"
- **THEN** server trả 409 `BOOST_NOT_ALLOWED` với câu nói tin đang hiển thị hạn chế, lý do hạn chế giữ nguyên

#### Scenario: Tin tạm ẩn

- **WHEN** chủ nhóm đẩy một tin của nhóm đang tạm ẩn vì nhiều người báo cáo
- **THEN** server trả 409 `BOOST_NOT_ALLOWED`

#### Scenario: Tin đã bán

- **WHEN** master đẩy lên đầu một tin đã bán
- **THEN** server trả 409 `BOOST_NOT_ALLOWED` với câu "Tin đã bán"

#### Scenario: Ngày hết hạn không đổi

- **WHEN** master đẩy lên đầu một tin còn 5 ngày hiển thị
- **THEN** tin vẫn còn 5 ngày hiển thị, trạng thái vẫn là đang hiển thị

### Requirement: Đẩy lên đầu

Đẩy lên đầu SHALL đặt vị trí xếp hạng của tin về lúc đẩy: tin đứng như vừa lên bảng ở mọi bảng tin chứa nó, rồi trôi
dần theo tin mới như thường. Lượt đẩy MUST NOT đổi nội dung tin; một lượt sửa người đăng đang làm dở MUST NOT bị từ chối
chỉ vì tin vừa được đẩy.

#### Scenario: Tin cũ lên đầu

- **WHEN** tin A lên bảng hôm qua, tin B cùng danh mục lên bảng sáng nay, rồi staff đẩy A lên đầu
- **THEN** bảng tin sàn chung và danh mục xếp A trên B

#### Scenario: Tin mới chen sau lượt đẩy

- **WHEN** tin C lên bảng sau lượt đẩy A
- **THEN** bảng tin xếp C trên A

#### Scenario: Người đăng đang sửa

- **WHEN** người đăng mở tin để sửa, master đẩy tin lên đầu, rồi người đăng lưu bản sửa với phiên bản đã đọc
- **THEN** bản sửa được nhận như thường

### Requirement: Thời gian chờ giữa hai lần đẩy lên đầu

Một tin SHALL chỉ được đẩy lên đầu lại sau `promotion.bumpCooldownHours` kể từ lần đẩy trước, bất kể ai đẩy (giá trị
khởi đầu 24 giờ; 0 = không chờ). Đẩy sớm hơn MUST nhận 429 `BOOST_COOLDOWN` kèm mốc đẩy lại được. Đặt hay bỏ nổi bật
không tính vào thời gian chờ.

#### Scenario: Đẩy lại sau 2 giờ

- **WHEN** staff đẩy tin A lên đầu, 2 giờ sau master đẩy A lên đầu lần nữa
- **THEN** server trả 429 `BOOST_COOLDOWN` với `retryAt` = lần đẩy trước + 24 giờ, vị trí của A không đổi

#### Scenario: Đủ 24 giờ

- **WHEN** 24 giờ sau lần đẩy trước, staff đẩy A lên đầu
- **THEN** lượt đẩy thành công

#### Scenario: Hai người đẩy cùng lúc

- **WHEN** hai người quản trị cùng đẩy lên đầu một tin trong cùng một khoảnh khắc
- **THEN** đúng một lượt thành công, lượt kia nhận 429 `BOOST_COOLDOWN`

#### Scenario: Nổi bật không vướng thời gian chờ

- **WHEN** tin A vừa được đẩy lên đầu, rồi master đặt A nổi bật 7 ngày
- **THEN** lượt đặt nổi bật thành công

### Requirement: Đặt nổi bật

Đặt nổi bật SHALL nhận số ngày nguyên từ 1 tới `promotion.featuredMaxDays` (giá trị khởi đầu 30) và đặt hạn nổi bật =
lúc đặt + số ngày. Đặt lại trên tin đang nổi bật SHALL thay hạn cũ, kéo dài hay rút ngắn đều được. Số ngày ngoài khoảng
MUST nhận 400 `VALIDATION_ERROR`. Đặt nổi bật MUST NOT đổi vị trí xếp hạng của tin.

#### Scenario: Nổi bật 7 ngày

- **WHEN** chủ nhóm đặt một tin của nhóm nổi bật 7 ngày
- **THEN** response có `featuredUntil` = lúc đặt + 7 ngày, tin vào dải nổi bật của nhóm

#### Scenario: Rút ngắn

- **WHEN** tin đang nổi bật tới 10 ngày nữa và master đặt lại nổi bật 1 ngày
- **THEN** hạn nổi bật mới là lúc đặt + 1 ngày

#### Scenario: Số ngày sai

- **WHEN** master đặt nổi bật 0 ngày hoặc 31 ngày
- **THEN** server trả 400 `VALIDATION_ERROR` và hạn nổi bật không đổi

### Requirement: Bỏ nổi bật

Người có quyền đẩy một tin SHALL bỏ được nổi bật của tin đó ở bất kỳ trạng thái nào; tin rời dải ngay. Bỏ nổi bật tin
không đang nổi bật SHALL thành công và không đổi gì.

#### Scenario: Bỏ nổi bật sớm

- **WHEN** tin đang nổi bật tới 5 ngày nữa và staff của danh mục bỏ nổi bật
- **THEN** response có `featuredUntil` null và tin không còn trong dải nổi bật

#### Scenario: Tin đang chờ duyệt

- **WHEN** tin đang nổi bật bị máy giữ sau khi sửa, và master bỏ nổi bật
- **THEN** lượt bỏ thành công, khi tin hiện lại nó không vào dải

#### Scenario: Tin không nổi bật

- **WHEN** master bỏ nổi bật một tin chưa từng nổi bật
- **THEN** server trả thành công với `featuredUntil` null

### Requirement: Hỏi trước quyền đẩy một tin

Người dùng đã đăng nhập SHALL hỏi được với một tin: vai đẩy tin của mình (master, staff, chủ nhóm, điều hành viên), tin
có đẩy được không và vì sao nếu không, mốc đẩy lên đầu lại được (trống khi đẩy được ngay), hạn nổi bật hiện tại, số ngày
nổi bật tối đa. Ngoài phạm vi MUST nhận 403 `FORBIDDEN`; tin không có hay đã xoá MUST nhận 404 `NOT_FOUND`.

#### Scenario: Staff hỏi tin đang trong thời gian chờ

- **WHEN** staff hỏi một tin sàn chung trong danh mục mình, tin được đẩy lên đầu 3 giờ trước
- **THEN** response có vai staff, đẩy được, mốc đẩy lên đầu lại = lần đẩy trước + 24 giờ

#### Scenario: Hỏi tin hạn chế

- **WHEN** master hỏi một tin đang hiển thị hạn chế
- **THEN** response nói tin không đẩy được kèm câu tin đang hiển thị hạn chế

#### Scenario: Người dùng thường hỏi

- **WHEN** người dùng không giữ vai quản trị hỏi một tin
- **THEN** server trả 403 `FORBIDDEN`

### Requirement: Nhật ký đẩy tin

Mỗi lượt đẩy lên đầu, đặt nổi bật, bỏ nổi bật có đổi gì SHALL ghi một dòng nhật ký vận hành: người làm, vai lúc làm, mã
tin, việc làm, số ngày và hạn nổi bật khi có. Dòng nhật ký MUST NOT chứa tiêu đề, mô tả, giá hay ảnh của tin (TK 27
cam kết 31). Lượt bị từ chối và bỏ nổi bật không đổi gì không ghi.

#### Scenario: Điều hành viên đặt nổi bật

- **WHEN** điều hành viên đặt một tin của nhóm nổi bật 3 ngày
- **THEN** nhật ký có dòng mang mã người làm, vai điều hành viên, mã tin, số ngày 3 và hạn nổi bật

#### Scenario: Lượt bị từ chối

- **WHEN** lượt đẩy lên đầu bị từ chối vì thời gian chờ
- **THEN** nhật ký không có dòng mới
