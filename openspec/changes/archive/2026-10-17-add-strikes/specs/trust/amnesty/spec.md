## Purpose

Cho master huỷ gậy của một người khi thấy cần, đi cùng đường với khiếu nại thắng và luôn để lại lý do trong
nhật ký (TK 22).

## ADDED Requirements

### Requirement: Master ân xá gậy kèm lý do

Chỉ master SHALL huỷ được một hay nhiều gậy của một người trong một lần ân xá, và mỗi lần ân xá MUST kèm lý
do. Nhật ký SHALL ghi master, từng gậy được huỷ và lý do.

#### Scenario: Ân xá hai gậy

- **WHEN** master ân xá cả hai gậy thường của một người kèm lý do
- **THEN** response có HTTP 200, hai gậy ở trạng thái đã huỷ, điểm gậy của người đó về 0 và nhật ký ghi
  master, hai gậy cùng lý do

#### Scenario: Thiếu lý do

- **WHEN** master ân xá một gậy mà bỏ trống lý do
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và gậy vẫn còn hiệu lực

#### Scenario: Staff thử ân xá

- **WHEN** một tài khoản mang quyền staff gọi thao tác ân xá
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Ân xá có hệ quả như khiếu nại thắng

Gậy được ân xá SHALL có đúng hệ quả của khiếu nại thắng: bị huỷ nhưng vẫn còn trong lịch sử, thôi tính điểm,
và tin bị từ chối hay bị gỡ kèm gậy đó trở lại hiển thị. Khiếu nại đang chờ về gậy đó SHALL đóng mà không cần
ai xét.

#### Scenario: Tin đi kèm trở lại

- **WHEN** master ân xá một gậy đi kèm một tin bị gỡ vì vi phạm
- **THEN** tin trở lại đang hiển thị và gậy vẫn có trong lịch sử với dấu đã huỷ

#### Scenario: Gậy đang có khiếu nại chờ xét

- **WHEN** master ân xá một gậy đang có khiếu nại chờ xét
- **THEN** khiếu nại đó đóng và không còn trong hàng chờ của người xét
