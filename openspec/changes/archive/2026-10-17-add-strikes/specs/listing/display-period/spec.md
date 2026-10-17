## ADDED Requirements

### Requirement: Ngày hiển thị khi khiếu nại thắng

Tin trở lại hiển thị vì khiếu nại thắng hoặc ân xá SHALL hiện với số ngày hiển thị còn lại lúc bị gỡ. Tin chưa
từng lên bảng SHALL được đủ 30 ngày (giá trị khởi đầu) tính từ lúc lên bảng.

#### Scenario: Tin bị gỡ khi còn 12 ngày

- **WHEN** một tin bị gỡ vì vi phạm lúc còn 12 ngày hiển thị và khiếu nại thắng 5 ngày sau
- **THEN** tin hiện lại với 12 ngày còn lại

#### Scenario: Tin chưa từng lên bảng

- **WHEN** một tin máy giữ bị từ chối vì vi phạm và khiếu nại thắng
- **THEN** tin lên bảng với đủ 30 ngày hiển thị

### Requirement: Huỷ gậy nghiêm trọng trả lại ngày hiển thị đã mất

Khi master huỷ một gậy nghiêm trọng, mỗi tin tạm ẩn vì lần khoá đó SHALL được trả lại đúng số ngày hiển thị đã
trôi trong lúc bị khoá. Hạ thành gậy nặng hay khoá vĩnh viễn MUST NOT trả lại ngày.

#### Scenario: Huỷ gậy sau 8 ngày khoá

- **WHEN** một tin còn 20 ngày hiển thị lúc tài khoản bị khoá vì gậy nghiêm trọng, và master huỷ gậy sau 8
  ngày
- **THEN** tin hiện lại với 20 ngày còn lại

#### Scenario: Hạ thành gậy nặng sau 8 ngày khoá

- **WHEN** một tin còn 20 ngày hiển thị lúc tài khoản bị khoá vì gậy nghiêm trọng, và master hạ gậy thành gậy
  nặng sau 8 ngày
- **THEN** tin hiện lại với 12 ngày còn lại
