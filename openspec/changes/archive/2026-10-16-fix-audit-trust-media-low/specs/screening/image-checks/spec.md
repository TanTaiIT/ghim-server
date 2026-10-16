## ADDED Requirements

### Requirement: Ảnh đã xoá hẳn không còn để so trùng

Ảnh bị xoá hẳn khỏi kho SHALL không còn được dùng để so trùng với ảnh của tài khoản khác. Dấu ảnh đã kiểm của nó MUST
được bỏ cùng lúc ảnh bị xoá hẳn.

#### Scenario: Ảnh bị thay rồi được dọn

- **WHEN** người dùng thay ảnh đại diện, lượt đối chiếu kho xoá hẳn ảnh cũ, và ảnh cũ đã có dấu ảnh đã kiểm
- **THEN** dấu ảnh của ảnh cũ không còn, dấu ảnh của ảnh mới vẫn còn
