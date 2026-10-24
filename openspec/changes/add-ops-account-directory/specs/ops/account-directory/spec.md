## ADDED Requirements

### Requirement: Danh bạ tài khoản cho bàn vận hành

Master và staff có việc hỗ trợ SHALL liệt kê được tài khoản chưa xoá, mới nhất trước, theo trang; lọc được theo
chuỗi `q` — khớp tên hiển thị không phân biệt hoa thường, hoặc email chuẩn hoá chứa chuỗi — và theo trạng thái (đang
hoạt động, chưa xác nhận email, đang khoá). Mỗi dòng SHALL có mã, tên hiển thị, email, vai, trạng thái, ngày tạo, lúc
khoá và lý do khoá, mức tin cậy, và cờ đang có cảnh cáo tính điểm. Tài khoản đã xoá MUST NOT có trong danh sách.

#### Scenario: Mới nhất trước, theo trang

- **WHEN** master mở danh bạ không lọc gì với `limit=2`
- **THEN** response có 2 tài khoản tạo gần nhất, `total` đếm mọi tài khoản chưa xoá, `totalPages` theo đó

#### Scenario: Tìm theo tên không phân biệt hoa thường

- **WHEN** master tìm `q=bình người mua`
- **THEN** kết quả có tài khoản tên "Bình Người Mua" và không có tài khoản tên khác

#### Scenario: Tìm theo email

- **WHEN** staff có việc hỗ trợ tìm `q=app.buyer`
- **THEN** kết quả có tài khoản email `app.buyer@ghim.local`, dòng đó ghi email, mức tin cậy và cờ cảnh cáo

#### Scenario: Lọc đang khoá

- **WHEN** master lọc `status=locked`
- **THEN** mọi dòng có trạng thái đang khoá kèm lúc khoá và lý do, tài khoản đang hoạt động không có trong kết quả

#### Scenario: Tài khoản đã xoá

- **WHEN** một tài khoản đã xoá có tên khớp `q`
- **THEN** nó không có trong kết quả

#### Scenario: Staff không có việc hỗ trợ

- **WHEN** staff chỉ được giao danh mục, hay người dùng thường, mở danh bạ
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Thẻ một tài khoản

Master và staff có việc hỗ trợ SHALL đọc được thẻ một tài khoản chưa xoá: các trường của dòng danh bạ kèm điểm vi phạm
đang tính. Tài khoản không có hay đã xoá MUST trả HTTP 404 `NOT_FOUND`.

#### Scenario: Thẻ tài khoản đang khoá

- **WHEN** master đọc thẻ một tài khoản đang bị khoá
- **THEN** response ghi trạng thái đang khoá, lúc khoá, lý do, mức tin cậy và điểm vi phạm đang tính

#### Scenario: Tài khoản không có hay đã xoá

- **WHEN** master đọc thẻ bằng mã không tồn tại, hay của tài khoản đã xoá
- **THEN** response có HTTP 404 `NOT_FOUND`
