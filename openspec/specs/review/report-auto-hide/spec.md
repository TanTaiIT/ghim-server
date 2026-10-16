# review/report-auto-hide Specification

## Purpose

Tạm giấu một tin sàn khi nhiều người đáng tin cùng báo trong thời gian ngắn để chờ người xử, mà không để báo cáo
thành công cụ hạ tin của đối thủ (TK 23, TK 8, cam kết 26).

## Requirements

### Requirement: Ngưỡng tạm ẩn khi nhiều người báo

Tin sàn SHALL tạm ẩn chờ người xử khi trong 24 giờ có 3 người khác nhau báo cáo nó từ 3 máy khác nhau — theo
dấu thiết bị của máy lúc báo — mỗi người ở mức T1 trở lên và có điểm báo cáo bình thường (giá trị khởi đầu).
Lượt báo không đủ các điều kiện đó vẫn vào hàng nhưng MUST NOT được đếm vào ngưỡng.

#### Scenario: Đủ ngưỡng

- **WHEN** 3 người ở mức T1 trở lên, điểm báo cáo bình thường, báo cáo một tin sàn từ 3 máy khác nhau trong
  vòng 10 giờ
- **THEN** tin bị tạm ẩn với lý do "nhiều người báo cáo"

#### Scenario: Mới có hai người

- **WHEN** 2 người đủ điều kiện báo cáo một tin sàn trong 24 giờ
- **THEN** tin vẫn hiển thị và báo cáo nằm trong hàng chờ

#### Scenario: Hai người báo từ cùng một máy

- **WHEN** 3 người đủ điều kiện báo cáo một tin sàn trong 24 giờ, trong đó 2 người báo từ cùng một máy
- **THEN** tin vẫn hiển thị

#### Scenario: Một người còn ở T0

- **WHEN** 3 người báo cáo một tin sàn từ 3 máy trong 24 giờ, trong đó một người ở mức T0
- **THEN** tin vẫn hiển thị và lượt báo của người T0 vẫn nằm trong báo cáo

#### Scenario: Một người có điểm báo cáo thấp

- **WHEN** 3 người ở mức T1 trở lên báo cáo một tin sàn từ 3 máy trong 24 giờ, trong đó một người có điểm báo
  cáo −4
- **THEN** tin vẫn hiển thị

#### Scenario: Các lượt báo cách nhau quá 24 giờ

- **WHEN** 3 người đủ điều kiện báo cáo một tin sàn lúc 0 giờ, 10 giờ và 26 giờ
- **THEN** tin vẫn hiển thị, vì không khoảng 24 giờ nào chứa đủ 3 lượt

#### Scenario: Tin trong nhóm

- **WHEN** 3 người đủ điều kiện báo cáo một tin trong nhóm từ 3 máy trong 24 giờ
- **THEN** tin không bị tạm ẩn tự động và báo cáo nằm trong hàng chờ

### Requirement: Tin tạm ẩn vì báo cáo chờ người xử

Tin tạm ẩn vì nhiều người báo SHALL giữ nguyên trạng thái, dừng ngày hiển thị, và MUST NOT tự hiện lại theo
thời gian; chỉ quyết định của người xử gỡ được cờ này. Người đăng thấy tin đang tạm ẩn chờ người duyệt, không
thấy ai đã báo.

#### Scenario: Người khác mở tin đang tạm ẩn

- **WHEN** một người khác mở tin đang tạm ẩn vì nhiều người báo
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Người đăng xem tin

- **WHEN** người đăng mở tin của mình đang tạm ẩn vì nhiều người báo
- **THEN** người đăng thấy tin đang tạm ẩn chờ người duyệt, và response không chứa danh tính người báo

#### Scenario: Không tự gỡ theo giờ

- **WHEN** tin bị tạm ẩn lúc còn 20 ngày hiển thị và 5 ngày trôi qua mà chưa ai quyết
- **THEN** tin vẫn tạm ẩn và vẫn còn 20 ngày hiển thị

#### Scenario: Người đăng sửa tin đang tạm ẩn

- **WHEN** người đăng sửa tin đang tạm ẩn vì nhiều người báo và máy cho bản sửa qua
- **THEN** tin vẫn tạm ẩn tới khi người xử quyết

### Requirement: Bác báo cáo thì tin hiện lại như cũ

Khi người xử bác báo cáo, cờ tạm ẩn vì nhiều người báo SHALL được gỡ; tin trở về đúng như trước khi ẩn và
MUST NOT mất ngày hiển thị nào.

#### Scenario: Bác sau ba ngày tạm ẩn

- **WHEN** tin đang hiển thị đầy đủ bị tạm ẩn lúc còn 20 ngày, 3 ngày sau người xử bác báo cáo
- **THEN** tin hiện lại ở mức đầy đủ với 20 ngày còn lại

### Requirement: Mỗi tin chỉ tự ẩn một lần giữa hai quyết định của người

Mỗi tin SHALL bị tạm ẩn tự động tối đa một lần giữa hai quyết định của người về tin đó. Sau khi người xử bác,
lượt báo mới về tin vẫn vào hàng nhưng MUST NOT làm tin tự ẩn lại.

#### Scenario: Báo cáo mới sau khi bị bác

- **WHEN** tin đã bị tạm ẩn tự động rồi được hiện lại vì người xử bác, và sau đó 3 người đủ điều kiện báo cáo
  tin từ 3 máy trong 24 giờ
- **THEN** tin vẫn hiển thị và báo cáo mới nằm trong hàng chờ với 3 người báo
