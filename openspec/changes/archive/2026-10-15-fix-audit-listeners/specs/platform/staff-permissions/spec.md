## ADDED Requirements

### Requirement: Treo quyền staff theo trạng thái hiện tại

Quyền staff SHALL chỉ bị treo khi tài khoản đang bị khoá: một lượt khoá được hệ thống xử lại sau khi tài khoản đã
mở khoá và master đã trả lại quyền MUST NOT treo lại quyền đó (chốt 15/10/2026).

#### Scenario: Lượt khoá được xử lại sau khi master trả quyền

- **WHEN** staff bị khoá rồi được mở khoá, master trả lại quyền, và hệ thống xử lại lượt khoá
- **THEN** quyền staff vẫn hoạt động
