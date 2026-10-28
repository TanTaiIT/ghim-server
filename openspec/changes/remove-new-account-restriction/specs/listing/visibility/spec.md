## MODIFIED Requirements

### Requirement: Hạn chế khi còn ít nhất một lý do

Tin SHALL hiển thị hạn chế khi còn ít nhất một lý do hạn chế, và đầy đủ khi không còn lý do nào. Mỗi lý do — "máy",
"cảnh cáo" — đặt và gỡ độc lập; gỡ một lý do MUST NOT mở tin còn lý do khác. Mức tin cậy của người đăng MUST NOT là một
lý do hạn chế: tin của người ở mức T0 mà máy cho qua đầy đủ SHALL hiển thị đầy đủ (chốt 28/10/2026, thay TK nguyên tắc 8
và cam kết 15).

#### Scenario: Gỡ một trong hai lý do

- **WHEN** một tin mang cả lý do "máy" lẫn "cảnh cáo" và điểm cảnh cáo của người đăng về 0
- **THEN** lý do "cảnh cáo" được gỡ còn tin vẫn hiển thị hạn chế vì lý do "máy"

#### Scenario: Gỡ lý do cuối cùng

- **WHEN** một tin chỉ còn lý do "máy" và người hậu kiểm cho tin đạt
- **THEN** tin hiển thị đầy đủ

#### Scenario: Tài khoản T0 đăng sàn chung

- **WHEN** máy cho qua đầy đủ một tin sàn chung của người đăng ở mức T0
- **THEN** tin hiển thị đầy đủ, không mang lý do hạn chế nào

#### Scenario: Tin đang mang lý do cũ lúc deploy

- **WHEN** một tin đang mang lý do "tài khoản mới" từ trước change này và không còn lý do nào khác
- **THEN** sau deploy tin hiển thị đầy đủ mà không cần người đăng lên T1

## REMOVED Requirements

### Requirement: Lý do "tài khoản mới"

**Reason**: Chủ dự án chốt 28/10/2026 — máy cho qua thì tin lên. Hạn chế vô điều kiện theo mức khiến mọi người đăng mới
chờ 7–10 ngày mới thấy tin trên bảng tin, và sàn mới mở thì bảng tin trống. Lớp bảo vệ này được bù bằng dấu thiết bị,
cảnh cáo theo email, chặn email dùng một lần, hạn mức T0 và hậu kiểm lấy mẫu 20% tin của T0–T1.

**Migration**: migration dữ liệu xoá `new_account` khỏi `restrictions` của mọi tin; giá trị enum giữ trong DB, code không
ghi nữa. Tín hiệu máy duyệt `new_account` (`screening/risk-scoring`) không đổi.
