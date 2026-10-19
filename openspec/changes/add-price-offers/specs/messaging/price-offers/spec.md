## ADDED Requirements

### Requirement: Người mua trả giá trong hội thoại về tin

Người mua SHALL gửi được một đề nghị giá trong hội thoại của mình về một tin: một số tiền nguyên, từ 1 đồng tới giá
đăng của tin. Đề nghị nằm trong dòng tin nhắn của hội thoại như một tin nhắn, kèm số tiền và trạng thái, và mới gửi thì
ở trạng thái đang chờ. Người bán MUST NOT gửi đề nghị giá (chốt 18/10/2026).

#### Scenario: Người mua trả giá

- **WHEN** người mua gửi đề nghị 12.000.000 đồng trong hội thoại về một tin đang hiển thị, cho thương lượng, giá đăng
  12.500.000 đồng
- **THEN** response có HTTP 201 với đề nghị đang chờ, và người bán thấy đề nghị đó trong dòng tin nhắn của hội thoại

#### Scenario: Trả đúng giá đăng

- **WHEN** người mua gửi đề nghị bằng đúng giá đăng của tin
- **THEN** response có HTTP 201 với đề nghị đang chờ

#### Scenario: Người bán trả giá

- **WHEN** người bán gửi đề nghị giá trong hội thoại về tin của mình
- **THEN** response có HTTP 403 `OFFER_BUYER_ONLY` và không đề nghị nào được thêm

#### Scenario: Giá cao hơn giá đăng

- **WHEN** người mua gửi đề nghị cao hơn giá đăng của tin
- **THEN** response có HTTP 400 `OFFER_ABOVE_PRICE` và không đề nghị nào được thêm

#### Scenario: Giá không hợp lệ

- **WHEN** người mua gửi đề nghị 0 đồng, số âm, hay số không nguyên
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không đề nghị nào được thêm

### Requirement: Chỉ trả giá khi tin còn hiển thị và cho thương lượng

Đề nghị giá MỚI SHALL chỉ gửi được khi tin của hội thoại đang hiển thị, cho thương lượng, và có giá lớn hơn 0. Hội
thoại vẫn nhận tin nhắn chữ như trước dù tin không còn hiển thị (TK 24).

#### Scenario: Tin không cho thương lượng

- **WHEN** người mua gửi đề nghị giá trong hội thoại về một tin đang hiển thị nhưng không cho thương lượng
- **THEN** response có HTTP 409 `OFFERS_NOT_ACCEPTED` và không đề nghị nào được thêm

#### Scenario: Tin cho tặng

- **WHEN** người mua gửi đề nghị giá trong hội thoại về một tin đang hiển thị có giá 0 đồng
- **THEN** response có HTTP 409 `OFFERS_NOT_ACCEPTED`

#### Scenario: Tin đã bán

- **WHEN** người mua gửi đề nghị giá trong hội thoại về một tin đã đánh dấu đã bán
- **THEN** response có HTTP 409 `LISTING_NOT_LIVE`, và người mua vẫn gửi được tin nhắn chữ trong hội thoại đó

#### Scenario: Tin hết hạn hay đang tạm ẩn

- **WHEN** người mua gửi đề nghị giá trong hội thoại về một tin đã hết hạn, hay đang tạm ẩn
- **THEN** response có HTTP 409 `LISTING_NOT_LIVE`

#### Scenario: Tin đã bị xoá

- **WHEN** người mua gửi đề nghị giá trong hội thoại về một tin người đăng đã xoá
- **THEN** response có HTTP 409 `LISTING_NOT_LIVE`

### Requirement: Mỗi hội thoại một đề nghị đang chờ

Một hội thoại MUST có tối đa một đề nghị đang chờ. Đề nghị mới của người mua SHALL làm đề nghị đang chờ trước đó
chuyển sang "đã thay"; đề nghị đã chấp nhận hay đã từ chối giữ nguyên trạng thái của nó.

#### Scenario: Trả giá lần hai

- **WHEN** người mua có đề nghị 11.000.000 đồng đang chờ rồi gửi đề nghị 11.500.000 đồng
- **THEN** đề nghị 11.000.000 đồng chuyển sang "đã thay", đề nghị 11.500.000 đồng đang chờ, và hội thoại có đúng một
  đề nghị đang chờ

#### Scenario: Trả giá sau khi bị từ chối

- **WHEN** đề nghị trước đã bị người bán từ chối và người mua gửi đề nghị mới
- **THEN** đề nghị cũ vẫn là "đã từ chối" và đề nghị mới đang chờ

#### Scenario: Hai đề nghị gửi cùng lúc

- **WHEN** người mua gửi hai đề nghị giá trong cùng một hội thoại cùng một lúc
- **THEN** cả hai đề nghị được thêm, và đúng một đề nghị còn đang chờ

### Requirement: Người bán chấp nhận hay từ chối

Người bán SHALL chấp nhận hay từ chối được đề nghị đang chờ trong hội thoại về tin của mình khi tin còn hiển thị.
Mỗi đề nghị MUST được trả lời tối đa một lần; đề nghị đã thay, đã chấp nhận hay đã từ chối không trả lời được nữa.

#### Scenario: Người bán chấp nhận

- **WHEN** người bán chấp nhận đề nghị đang chờ của người mua
- **THEN** response có HTTP 200 với đề nghị ở trạng thái "đã chấp nhận", và người mua thấy trạng thái đó trong dòng
  tin nhắn

#### Scenario: Người bán từ chối

- **WHEN** người bán từ chối đề nghị đang chờ
- **THEN** response có HTTP 200 với đề nghị ở trạng thái "đã từ chối"

#### Scenario: Trả lời đề nghị đã thay

- **WHEN** người bán chấp nhận một đề nghị đã bị đề nghị mới hơn thay
- **THEN** response có HTTP 409 `OFFER_NOT_PENDING` và trạng thái đề nghị không đổi

#### Scenario: Trả lời hai lần

- **WHEN** người bán từ chối một đề nghị đã chấp nhận trước đó
- **THEN** response có HTTP 409 `OFFER_NOT_PENDING` và đề nghị vẫn là "đã chấp nhận"

#### Scenario: Người mua tự trả lời đề nghị của mình

- **WHEN** người mua chấp nhận đề nghị giá của chính mình
- **THEN** response có HTTP 403 `OFFER_SELLER_ONLY` và trạng thái đề nghị không đổi

#### Scenario: Tin đã bán khi đề nghị còn chờ

- **WHEN** người bán đánh dấu tin đã bán rồi chấp nhận đề nghị còn đang chờ của hội thoại đó
- **THEN** response có HTTP 409 `LISTING_NOT_LIVE` và đề nghị vẫn đang chờ

#### Scenario: Chấp nhận đúng lúc người mua trả giá mới

- **WHEN** người bán chấp nhận đề nghị đang chờ đúng lúc người mua gửi đề nghị mới
- **THEN** đề nghị cũ chỉ có một kết cục — hoặc "đã chấp nhận" và đề nghị mới đang chờ, hoặc "đã thay" và lượt chấp
  nhận nhận HTTP 409 `OFFER_NOT_PENDING`

#### Scenario: Mã đề nghị không thuộc hội thoại

- **WHEN** người bán trả lời bằng mã của một tin nhắn chữ, hay của một đề nghị ở hội thoại khác
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Chấp nhận chỉ là ghi nhận

Chấp nhận một đề nghị SHALL chỉ đổi trạng thái của đề nghị đó. Trạng thái tin, giá đăng, chỗ của tin trên bảng tin
và tìm kiếm MUST NOT đổi; người mua khác vẫn mở hội thoại và trả giá với tin như trước (chốt 18/10/2026).

#### Scenario: Tin sau khi chấp nhận

- **WHEN** người bán chấp nhận đề nghị 12.000.000 đồng cho một tin giá đăng 12.500.000 đồng
- **THEN** tin vẫn đang hiển thị với giá 12.500.000 đồng, trên bảng tin và tìm kiếm như trước

#### Scenario: Người mua khác vẫn trả giá được

- **WHEN** người bán đã chấp nhận đề nghị của người mua A, và người mua B gửi đề nghị trong hội thoại của B về cùng tin
- **THEN** đề nghị của B được thêm và đang chờ

### Requirement: Trả giá theo luật của hội thoại

Đề nghị giá và câu trả lời SHALL theo đúng luật của tin nhắn trong hội thoại: chỉ hai bên thao tác được, người ngoài
nhận "không tìm thấy", có chặn thì không gửi được, bên kia đã rời Ghim thì không gửi được, tài khoản master không nhắn
tin. Đề nghị giá của người mua MUST được tính là người mua đã nhắn hỏi mua tin đó (TK 20) và MUST NOT bị tính vào hạn
mức hội thoại mới.

#### Scenario: Người ngoài trả giá

- **WHEN** một người dùng không phải hai bên gửi đề nghị giá vào một hội thoại có thật
- **THEN** response có HTTP 404 `NOT_FOUND`, giống hệt với một mã hội thoại không tồn tại

#### Scenario: Có chặn giữa hai bên

- **WHEN** người bán đã chặn người mua và người mua gửi đề nghị giá trong hội thoại chung
- **THEN** response có HTTP 403 `MESSAGING_BLOCKED` và không đề nghị nào được thêm

#### Scenario: Chặn sau khi có đề nghị đang chờ

- **WHEN** người mua chặn người bán khi đang có đề nghị chờ, rồi người bán chấp nhận đề nghị đó
- **THEN** response có HTTP 403 `MESSAGING_BLOCKED` và đề nghị vẫn đang chờ

#### Scenario: Người bán đã xoá tài khoản

- **WHEN** người bán đã xoá tài khoản và người mua gửi đề nghị giá trong hội thoại đó
- **THEN** response có HTTP 409 `CONVERSATION_CLOSED`

#### Scenario: Hết lượt hội thoại mới vẫn trả giá được

- **WHEN** người mua T0 đã hết lượt hội thoại mới trong ngày gửi đề nghị giá trong một hội thoại đã có
- **THEN** đề nghị được thêm

#### Scenario: Đề nghị giá là người mua đã nhắn hỏi mua

- **WHEN** người mua chỉ gửi một đề nghị giá, không gửi tin nhắn chữ nào, rồi người bán đánh dấu đã bán sau 2 ngày
- **THEN** tin được tính là có người nhắn hỏi mua khi xét tin sạch
