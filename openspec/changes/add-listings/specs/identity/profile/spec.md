## ADDED Requirements

### Requirement: Hồ sơ công khai liệt kê tin đang bán

Hồ sơ công khai SHALL liệt kê các tin đang hiển thị của người đó — cả mức đầy đủ lẫn hạn chế — mà người xem được
phép thấy theo luật "ai thấy một tin" (listing/visibility). Tin nháp, đang kiểm, chờ duyệt, bị từ chối, bị gỡ,
đã xoá hay đang tạm ẩn MUST NOT có trong danh sách (TK 7).

#### Scenario: Khách xem hồ sơ

- **WHEN** khách mở hồ sơ của người bán có một tin sàn chung đầy đủ và một tin sàn chung hạn chế
- **THEN** danh sách tin trên hồ sơ có cả hai tin

#### Scenario: Tin "chỉ thành viên"

- **WHEN** người bán có một tin "chỉ thành viên" của nhóm X, và lần lượt khách rồi một thành viên nhóm X mở hồ
  sơ
- **THEN** khách không thấy tin đó trên hồ sơ, còn thành viên nhóm X thì thấy

#### Scenario: Tin chưa lên bảng hoặc đang tạm ẩn

- **WHEN** người bán có một nháp, một tin chờ duyệt và một tin đang tạm ẩn vì nhóm bị khoá
- **THEN** cả ba tin không có trên hồ sơ công khai
