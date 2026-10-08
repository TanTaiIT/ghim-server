## ADDED Requirements

### Requirement: Có gậy thì quyền staff tự treo

Tài khoản mang quyền staff nhận bất kỳ gậy nào SHALL bị treo quyền staff ngay, kể cả gậy thường. Trong lúc
treo, mọi thao tác staff của tài khoản đó MUST bị từ chối; tài khoản vẫn SHALL dùng app như một người dùng.

#### Scenario: Staff nhận gậy thường

- **WHEN** một staff nhận gậy thường rồi mở hàng chờ của danh mục mình
- **THEN** response có HTTP 403 `STAFF_PERMISSION_SUSPENDED`

#### Scenario: Vẫn dùng app như người dùng

- **WHEN** staff đang bị treo quyền gửi một tin mới
- **THEN** lượt gửi được nhận và tin qua máy như tin của mọi người dùng

### Requirement: Hết gậy thì master quyết trả lại quyền staff

Khi gậy của một staff đang bị treo quyền hết hạn, quyền staff MUST NOT tự trở lại; quyền SHALL chỉ trở lại khi
master trả lại.

#### Scenario: Gậy hết hạn

- **WHEN** gậy duy nhất của staff đang bị treo quyền hết hạn
- **THEN** mọi thao tác staff của tài khoản đó vẫn nhận HTTP 403 `STAFF_PERMISSION_SUSPENDED`

#### Scenario: Master trả lại quyền

- **WHEN** master trả lại quyền staff cho tài khoản đó sau khi gậy đã hết hạn
- **THEN** tài khoản thao tác staff được trở lại
