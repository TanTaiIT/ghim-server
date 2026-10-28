## ADDED Requirements

### Requirement: Nhóm "ví Xu"

Thông báo về biến động ví do người khác gây ra (master cấp hay trừ, hoàn Xu) SHALL thuộc nhóm "ví Xu", người dùng bật
tắt được như các nhóm khác. Biến động do chính người dùng làm (mua gói) MUST NOT sinh thông báo.

#### Scenario: Master cấp Xu

- **WHEN** master cấp Xu cho một người dùng đang bật nhóm "ví Xu"
- **THEN** người đó nhận một thông báo nhóm "ví Xu" nêu số Xu và số dư mới, có nhắc

#### Scenario: Tự mua gói

- **WHEN** người dùng mua một gói đẩy tin bằng Xu của mình
- **THEN** không có thông báo nào về biến động ví
