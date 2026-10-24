## MODIFIED Requirements

### Requirement: Tài khoản bị khoá thì quyền staff tự treo

Khi tài khoản mang quyền staff bị khoá, quyền staff SHALL tự treo ngay và giữ nguyên phạm vi. Quyền đang treo
MUST NOT cho làm thao tác nào của bàn vận hành.

#### Scenario: Master khoá tài khoản của một staff

- **WHEN** master khoá tài khoản của Hùng, đang là staff danh mục Điện thoại
- **THEN** danh sách staff hiện Hùng "đang treo" với lý do "tài khoản bị khoá", phạm vi vẫn là Điện thoại

#### Scenario: Quyền treo vẫn là quyền staff với đăng nhập

- **WHEN** tài khoản có quyền đang treo được mở khoá và đăng nhập lại
- **THEN** vẫn chịu trần 3 phiên như staff
