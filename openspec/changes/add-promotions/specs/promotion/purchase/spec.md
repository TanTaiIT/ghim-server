## Purpose

Mua gói cho một tin: trừ Xu và áp hiệu ứng trong một lượt, chỉ cho tin đang thật sự hiện với người mua, có thời gian chờ
và hoàn Xu theo luật rõ ràng (kế hoạch gói đẩy tin mục 4.3).

## ADDED Requirements

### Requirement: Chỉ tin đang hiển thị đầy đủ mua được gói

Người đăng SHALL mua được gói cho tin của mình chỉ khi tin đang hiển thị, hiển thị đầy đủ, không tạm ẩn, người đăng
không đang tạm khoá đăng tin và đủ mức tối thiểu của gói. Trường hợp khác MUST bị từ chối kèm lý do. Mua gói MUST NOT
đổi trạng thái, cờ tạm ẩn hay lý do hạn chế của tin (TK 26 luật 3).

#### Scenario: Tin đang hiển thị hạn chế

- **WHEN** người đăng mua gói cho tin đang hiển thị hạn chế vì lý do "máy"
- **THEN** response có HTTP 409 `LISTING_NOT_PROMOTABLE` kèm lý do, không trừ Xu, tin không đổi

#### Scenario: Tin đang chờ duyệt

- **WHEN** người đăng mua gói cho tin đang chờ người duyệt
- **THEN** response có HTTP 409 `LISTING_NOT_PROMOTABLE` và tin vẫn không hiện với người mua

#### Scenario: Đang tạm khoá đăng tin

- **WHEN** người đăng có 3 điểm gậy mua gói cho một tin đang hiển thị
- **THEN** response có HTTP 409 `POSTING_LOCKED`

### Requirement: Trừ Xu và áp hiệu ứng trong một lượt

Mua gói SHALL trừ giá gói khỏi ví và áp hiệu ứng lên tin trong cùng một lượt, với khoá chống lặp từ app: thiếu Xu thì không
áp (HTTP 409 `INSUFFICIENT_BALANCE`); tin đã đổi phiên bản giữa chừng thì không trừ (HTTP 409 `CONFLICT`). Mỗi lượt mua
SHALL có một dòng sổ cái `product_purchase` trỏ tới tin và gói.

#### Scenario: Mua thành công

- **WHEN** người đăng có 50 Xu mua gói "đẩy lên đầu" giá 20 Xu cho tin đang hiển thị đầy đủ
- **THEN** ví còn 30 Xu, sổ cái có dòng −20 trỏ tới tin, tin đứng đầu bảng tin, lượt mua ghi lúc áp

#### Scenario: Gửi lại sau mất mạng

- **WHEN** app gửi lại lượt mua với cùng khoá chống lặp
- **THEN** response có HTTP 200 với cùng lượt mua, ví chỉ bị trừ một lần

### Requirement: Thời gian chờ và trần mỗi ngày

Cùng một tin MUST NOT mua lại cùng gói trong thời gian chờ của gói; một người MUST NOT mua quá số lượt mỗi ngày (giá trị
khởi đầu) của bảng con số. Từ chối SHALL nêu lúc được mua lại.

#### Scenario: Mua lại trong thời gian chờ

- **WHEN** người đăng mua lại gói "đẩy lên đầu" cho tin vừa đẩy 2 giờ trước, thời gian chờ 24 giờ
- **THEN** response có HTTP 429 `PROMOTION_COOLDOWN` kèm lúc được mua lại, không trừ Xu

### Requirement: Hoàn Xu

Khiếu nại thắng hay ân xá làm tin trở lại hiển thị SHALL hoàn phần thời hạn chưa hưởng của gói còn hiệu lực lúc tin bị gỡ,
bằng dòng sổ cái `refund` trỏ tới lượt mua. Tin bị gỡ vì vi phạm, bị từ chối sau khi sửa, hay tạm ẩn vì người đăng gây ra
MUST NOT được hoàn.

#### Scenario: Khiếu nại thắng

- **WHEN** tin có gói nổi bật 7 ngày bị gỡ vì vi phạm ở ngày thứ 2 và khiếu nại thắng ở ngày thứ 5
- **THEN** ví được hoàn phần tương ứng 5 ngày chưa hưởng, sổ cái có dòng `refund` trỏ tới lượt mua

#### Scenario: Gỡ vì vi phạm, không khiếu nại

- **WHEN** tin có gói nổi bật bị gỡ vì vi phạm và gậy chạy tới hết hạn
- **THEN** không hoàn Xu

### Requirement: Người đăng biết gói đang chạy

Người đăng SHALL thấy trên tin của mình gói đang chạy, lúc hết hạn và lúc được mua lại; người xem khác chỉ thấy tin nổi
bật hay không.

#### Scenario: Xem tin của mình

- **WHEN** người đăng mở tin vừa mua gói nổi bật 7 ngày
- **THEN** tin nêu gói đang chạy và `featuredUntil` sau 7 ngày
