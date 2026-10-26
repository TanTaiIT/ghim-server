## ADDED Requirements

### Requirement: Từ khoá suy ra danh mục

Master và staff được giao một danh mục SHALL đọc và thay được bộ từ khoá dùng để suy ra danh mục đó cho dấu hiệu "sai
danh mục" (`screening/risk-scoring`). Từ khoá SHALL được lưu và trả về ở dạng bỏ dấu như lúc so; trùng nhau sau khi bỏ
dấu thì chỉ giữ một.

#### Scenario: Staff của danh mục đọc rồi thay từ khoá

- **WHEN** staff được giao danh mục Đèn thay bộ từ khoá bằng "Đèn bàn" và "den ban" rồi đọc lại
- **THEN** bộ từ khoá của danh mục là đúng một từ khoá "DEN BAN"

#### Scenario: Staff danh mục khác

- **WHEN** staff không được giao danh mục đó thay bộ từ khoá của nó
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Danh mục không tồn tại

- **WHEN** master đọc từ khoá của một mã danh mục không có
- **THEN** response có HTTP 404 `NOT_FOUND`
