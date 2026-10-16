## ADDED Requirements

### Requirement: Nhận làm chủ khi đang bị cấm

Người đang bị cấm khỏi một nhóm mà nhận lời giao chủ của nhóm đó thì lệnh cấm SHALL được gỡ như khi gỡ cấm: tin của
người đó trong nhóm MUST NOT còn bị ẩn vì lệnh cấm.

#### Scenario: Master giao chủ cho người đang bị cấm

- **WHEN** Minh bị cấm khỏi nhóm A lúc có một tin trong nhóm, rồi master giao chủ nhóm A cho Minh và Minh đồng ý
- **THEN** Minh là chủ nhóm A, không còn trong danh sách người bị cấm, và tin của Minh không còn bị ẩn vì lệnh cấm
