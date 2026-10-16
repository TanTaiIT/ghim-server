## ADDED Requirements

### Requirement: Tin đang tạm ẩn không bị lấy mẫu

Tin đang tạm ẩn (khoá, cấm, rời nhóm, danh mục tắt…) MUST NOT bị lấy mẫu hậu kiểm, kể cả mẫu hậu kiểm người duyệt
(chốt 15/10/2026).

#### Scenario: Danh mục bị tắt

- **WHEN** một tin vừa lên bảng thuộc danh mục bị tắt trước lượt lấy mẫu, tỉ lệ lấy mẫu 100%
- **THEN** tin không bị lấy mẫu
