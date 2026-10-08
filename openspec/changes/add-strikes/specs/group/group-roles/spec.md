## ADDED Requirements

### Requirement: Gậy nặng làm tạm mất vai trong nhóm

Chủ nhóm hay điều hành viên đang có gậy nặng còn hiệu lực SHALL tạm mất vai ở mọi nhóm: mọi thao tác của vai đó
MUST bị từ chối. Điều hành viên SHALL có lại vai khi gậy nặng hết hiệu lực — hết hạn hoặc bị huỷ. Gậy thường
MUST NOT làm mất vai.

#### Scenario: Điều hành viên nhận gậy nặng

- **WHEN** một điều hành viên nhận gậy nặng rồi duyệt một đơn xin vào nhóm
- **THEN** response có HTTP 403 `GROUP_ROLE_SUSPENDED` và đơn vẫn chờ

#### Scenario: Điều hành viên nhận gậy thường

- **WHEN** một điều hành viên nhận gậy thường rồi duyệt một đơn xin vào nhóm
- **THEN** đơn được duyệt như bình thường

#### Scenario: Gậy nặng hết hạn

- **WHEN** gậy nặng của điều hành viên đó hết hạn
- **THEN** người đó làm lại được việc điều hành trong phạm vi cũ

#### Scenario: Gậy nặng bị huỷ

- **WHEN** gậy nặng của điều hành viên bị huỷ vì khiếu nại thắng
- **THEN** người đó làm lại được việc điều hành ngay

### Requirement: Chủ nhóm nhận gậy nặng thì nhóm thiếu chủ

Khi chủ nhóm của một nhóm đang hoạt động nhận gậy nặng, nhóm SHALL chuyển sang trạng thái thiếu chủ như khi tài
khoản chủ nhóm bị khoá.

#### Scenario: Chủ nhóm nhận gậy nặng

- **WHEN** chủ nhóm của một nhóm đang hoạt động nhận gậy nặng
- **THEN** nhóm chuyển sang thiếu chủ và người đó đổi cài đặt nhóm nhận HTTP 403 `GROUP_ROLE_SUSPENDED`

#### Scenario: Chủ nhóm nhận gậy thường

- **WHEN** chủ nhóm nhận gậy thường
- **THEN** nhóm vẫn đang hoạt động với chủ nhóm đó
