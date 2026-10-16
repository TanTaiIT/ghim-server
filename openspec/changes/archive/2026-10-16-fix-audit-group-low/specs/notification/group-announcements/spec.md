## ADDED Requirements

### Requirement: Xoá đơn vị thì xoá thông báo gửi riêng cho nó

Xoá một đơn vị con SHALL xoá các thông báo của nhóm gửi riêng cho đơn vị đó. Thông báo đó MUST NOT thành thông báo gửi
cả nhóm.

#### Scenario: Xoá lớp đã có thông báo riêng

- **WHEN** chủ nhóm gửi một thông báo riêng cho lớp 10A1, rồi xoá lớp 10A1
- **THEN** thông báo đó không còn trong danh sách thông báo của nhóm, kể cả với thành viên không thuộc lớp nào
