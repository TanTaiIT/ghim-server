## ADDED Requirements

### Requirement: Khoá, mở khoá chủ nhóm theo trạng thái hiện tại

Nhóm chuyển sang thiếu chủ hay trở lại với chủ cũ SHALL theo trạng thái hiện tại của tài khoản chủ: một lượt khoá
được hệ thống xử lại sau khi chủ đã được mở khoá MUST NOT làm nhóm thiếu chủ, và lượt mở khoá xử lại khi chủ đang
bị khoá MUST NOT trả nhóm cho chủ (chốt 15/10/2026).

#### Scenario: Lượt khoá chủ được xử lại sau khi mở khoá

- **WHEN** chủ nhóm bị khoá rồi được mở khoá, nhóm đã trở lại với chủ cũ, và hệ thống xử lại lượt khoá
- **THEN** nhóm vẫn đang hoạt động với chủ cũ, không có đề cử nào
