## ADDED Requirements

### Requirement: Tin hiển thị đầy đủ mua được gói, không xét mức tin cậy

Người đăng SHALL mua được gói cho tin của mình chỉ khi tin đang hiển thị, hiển thị đầy đủ, không tạm ẩn và người đăng
không đang tạm khoá đăng tin. Trường hợp khác MUST bị từ chối kèm lý do. Mức tin cậy của người đăng MUST NOT là lý do từ
chối (chốt 03/11/2026). Mua gói MUST NOT đổi trạng thái, cờ tạm ẩn hay lý do hạn chế của tin (TK 26 luật 3).

#### Scenario: Tin đang hiển thị hạn chế

- **WHEN** người đăng mua gói cho tin đang hiển thị hạn chế vì lý do "máy"
- **THEN** response có HTTP 409 `LISTING_NOT_PROMOTABLE` kèm lý do, không trừ Xu, tin không đổi

#### Scenario: Tin đang chờ duyệt

- **WHEN** người đăng mua gói cho tin đang chờ người duyệt
- **THEN** response có HTTP 409 `LISTING_NOT_PROMOTABLE` và tin vẫn không hiện với người mua

#### Scenario: Đang tạm khoá đăng tin

- **WHEN** người đăng có 3 điểm gậy mua gói cho một tin đang hiển thị
- **THEN** response có HTTP 409 `POSTING_LOCKED`

#### Scenario: Người đăng ở T0

- **WHEN** người đăng ở T0 có 5 Xu mua gói "Đẩy lên đầu" 1 Xu cho tin đang hiển thị đầy đủ
- **THEN** lượt mua thành công và ví còn 4 Xu

## REMOVED Requirements

### Requirement: Chỉ tin đang hiển thị đầy đủ mua được gói

**Reason**: Requirement đòi người đăng đủ mức tối thiểu của gói và có scenario "Chưa đủ mức" (`TRUST_TIER_TOO_LOW`); chủ
dự án bỏ mức tối thiểu ngày 03/11/2026.

**Migration**: Thay bằng "Tin hiển thị đầy đủ mua được gói, không xét mức tin cậy" — các điều kiện còn lại giữ nguyên;
route mua gói không còn trả `TRUST_TIER_TOO_LOW`.
