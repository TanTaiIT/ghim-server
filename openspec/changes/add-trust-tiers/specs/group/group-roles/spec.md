## ADDED Requirements

### Requirement: Nhận vai chủ nhóm hay điều hành viên cần mức T1 trở lên

Chỉ tài khoản đang ở mức T1 trở lên SHALL nhận được vai chủ nhóm hay điều hành viên. Bổ nhiệm điều hành viên,
hay bấm đồng ý nhận vai chủ nhóm — do master giao hoặc do chủ cũ chuyển nhượng — khi người nhận đang ở mức T0
MUST bị từ chối; mức được xét tại lúc người nhận thật sự nhận vai.

#### Scenario: Bổ nhiệm điều hành viên đang ở T0

- **WHEN** chủ nhóm bổ nhiệm một thành viên đang ở mức T0 làm điều hành viên
- **THEN** response có HTTP 409 `TRUST_TIER_TOO_LOW` và thành viên đó không có vai điều hành viên

#### Scenario: Bổ nhiệm điều hành viên đang ở T1

- **WHEN** chủ nhóm bổ nhiệm một thành viên đang ở mức T1 làm điều hành viên
- **THEN** thành viên đó có vai điều hành viên

#### Scenario: Nhận chuyển nhượng chủ nhóm khi đang ở T0

- **WHEN** người được chuyển nhượng vai chủ nhóm bấm đồng ý khi đang ở mức T0
- **THEN** response có HTTP 409 `TRUST_TIER_TOO_LOW` và chủ nhóm cũ vẫn giữ vai

#### Scenario: Tụt mức giữa lúc được giao và lúc đồng ý

- **WHEN** master giao chủ cho một nhóm mới lập cho người đang ở mức T1, rồi người đó bị tính lại về T0 trước
  khi bấm đồng ý
- **THEN** lượt bấm đồng ý nhận HTTP 409 `TRUST_TIER_TOO_LOW` và nhóm vẫn chờ giao chủ

#### Scenario: Nhận lời giao chủ khi đủ mức

- **WHEN** master giao chủ cho một nhóm mới lập và người được giao bấm đồng ý khi đang ở mức T1
- **THEN** người đó thành chủ nhóm
