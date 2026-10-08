## ADDED Requirements

### Requirement: Tin bị từ chối hay gỡ vì vi phạm không tự xoá được

Người đăng MUST NOT tự xoá tin đang bị từ chối hay bị gỡ vì vi phạm — tin đó là hồ sơ của gậy. Khi khiếu nại
thắng hoặc gậy được ân xá, tin trở lại hiển thị và SHALL xoá được như mọi tin. Tin bị từ chối hay bị gỡ vì sai
sót vẫn SHALL xoá được.

#### Scenario: Xoá tin bị gỡ vì vi phạm

- **WHEN** người đăng xoá một tin đang bị gỡ vì vi phạm
- **THEN** response có HTTP 409 `LISTING_DELETE_BLOCKED` kèm lý do "tin bị gỡ vì vi phạm" và tin không đổi

#### Scenario: Xoá sau khi khiếu nại thắng

- **WHEN** tin trở lại hiển thị vì khiếu nại thắng và người đăng xoá nó
- **THEN** tin bị xoá như mọi tin

#### Scenario: Xoá tin bị từ chối vì sai sót

- **WHEN** người đăng xoá một tin bị từ chối vì sai sót
- **THEN** tin bị xoá
