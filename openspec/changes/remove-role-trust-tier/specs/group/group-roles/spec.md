## ADDED Requirements

### Requirement: Nhận vai không xét mức tin cậy

Bổ nhiệm điều hành viên, hay bấm đồng ý nhận vai chủ nhóm — do master giao hoặc do chủ cũ chuyển nhượng — SHALL NOT xét
mức tin cậy của người nhận: tài khoản ở mức T0 MUST nhận được vai như mọi mức khác. Các điều kiện khác của người nhận
(tài khoản đang hoạt động, không đang bị cấm, không có gậy nặng) giữ nguyên (chốt 03/11/2026).

#### Scenario: Bổ nhiệm điều hành viên đang ở T0

- **WHEN** chủ nhóm bổ nhiệm một thành viên đang ở mức T0 làm điều hành viên
- **THEN** thành viên đó có vai điều hành viên

#### Scenario: Nhận chuyển nhượng chủ nhóm khi đang ở T0

- **WHEN** người được chuyển nhượng vai chủ nhóm bấm đồng ý khi đang ở mức T0
- **THEN** người đó thành chủ nhóm

#### Scenario: Nhận lời giao chủ của master khi đang ở T0

- **WHEN** master giao chủ cho một nhóm mới lập và người được giao bấm đồng ý khi đang ở mức T0
- **THEN** người đó thành chủ nhóm

## REMOVED Requirements

### Requirement: Nhận vai chủ nhóm hay điều hành viên cần mức T1 trở lên

**Reason**: Chủ dự án chốt 03/11/2026 "có người giao thì nhận được": nhóm mới lập thường giao cho người vừa đăng ký và
bị kẹt ở "chờ giao chủ" tới khi người đó lên T1.

**Migration**: Thay bằng "Nhận vai không xét mức tin cậy". Route nhóm không còn trả `TRUST_TIER_TOO_LOW`; client không
phải đổi gì.

### Requirement: Tụt mức không làm mất vai đang giữ

**Reason**: Mức không còn được xét lúc nhận vai nên không còn gì để nói về tụt mức sau khi nhận; vai chỉ mất theo các
đường đã có (khoá tài khoản, gậy nặng, xoá tài khoản).

**Migration**: Không cần — hành vi không đổi (tụt mức vẫn không bãi vai).
