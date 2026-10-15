## MODIFIED Requirements

### Requirement: Việc hằng ngày trong lúc thiếu chủ

Trong lúc thiếu chủ, điều hành viên SHALL tiếp tục việc hằng ngày trong phạm vi của mình. Quyền riêng của chủ
nhóm — đổi cài đặt, bổ nhiệm điều hành viên — MUST NOT chuyển sang ai trong nhóm; master không bị luật này chặn, trừ việc chuyển nhóm còn tin "nhóm công khai" sang riêng tư: việc đó chờ có chủ
(chốt 15/10/2026).

#### Scenario: Duyệt đơn khi thiếu chủ

- **WHEN** điều hành viên duyệt một đơn xin vào nhóm đang thiếu chủ
- **THEN** người xin thành thành viên

#### Scenario: Bổ nhiệm khi thiếu chủ

- **WHEN** điều hành viên cấp cả nhóm bổ nhiệm một điều hành viên mới trong lúc nhóm thiếu chủ
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Đổi cài đặt khi thiếu chủ

- **WHEN** điều hành viên cấp cả nhóm đổi chế độ nhóm trong lúc nhóm thiếu chủ
- **THEN** response có HTTP 403 `FORBIDDEN` và chế độ không đổi

#### Scenario: Master đổi chế độ khi thiếu chủ

- **WHEN** master đổi chế độ của một nhóm đang thiếu chủ
- **THEN** chế độ đổi như ở nhóm có chủ

#### Scenario: Master chuyển nhóm thiếu chủ sang riêng tư khi còn tin "nhóm công khai"

- **WHEN** master đổi một nhóm công khai đang thiếu chủ, còn tin "nhóm công khai", sang riêng tư
- **THEN** response có HTTP 409 `GROUP_OWNER_REQUIRED`, nhóm vẫn thiếu chủ và chế độ không đổi
