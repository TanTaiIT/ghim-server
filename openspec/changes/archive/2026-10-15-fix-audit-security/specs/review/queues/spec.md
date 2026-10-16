## ADDED Requirements

### Requirement: Quyền master với việc chỉ dùng ở bàn vận hành

Ở các thao tác hàng chờ của nhóm, master MUST NOT mang quyền master. Ở đó chỉ vai trong nhóm được tính, mà master không
vào nhóm nào (TK 5). Master SHALL thấy và xử mọi việc, kể cả việc của nhóm, ở bàn vận hành, nơi đòi lớp thứ hai (chốt
15/10/2026).

#### Scenario: Master mở việc của nhóm qua thao tác của nhóm

- **WHEN** master xem hay nhận một việc về tin trong nhóm bằng thao tác hàng chờ của nhóm đó
- **THEN** response có HTTP 404 `NOT_FOUND` và việc không đổi

#### Scenario: Master xem hàng chờ của nhóm

- **WHEN** master xem hàng chờ của một nhóm bằng thao tác hàng chờ của nhóm
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Master xử việc của nhóm ở bàn vận hành

- **WHEN** master đã qua lớp thứ hai nhận và quyết một việc về tin trong nhóm ở bàn vận hành
- **THEN** quyết định được ghi dưới vai master
