## ADDED Requirements

### Requirement: Báo người đăng về gói đẩy tin

Người đăng SHALL được báo (nhóm "tin đăng của bạn", có nhắc) khi gói vừa được áp — nêu gói và lúc hết hạn — và khi tin
nổi bật sắp hết hạn (trước một ngày, giá trị khởi đầu). Thông báo MUST NOT nhắc tới số Xu đã trừ (ví có dòng riêng).

#### Scenario: Gói vừa áp

- **WHEN** người đăng mua gói nổi bật 7 ngày cho tin "Xe đạp cũ"
- **THEN** người đó nhận thông báo "«Xe đạp cũ» nổi bật tới ngày …" có nhắc

#### Scenario: Sắp hết hạn nổi bật

- **WHEN** còn một ngày nữa hết hạn nổi bật
- **THEN** người đăng nhận thông báo tin sắp hết nổi bật, một lần cho mỗi lượt mua
