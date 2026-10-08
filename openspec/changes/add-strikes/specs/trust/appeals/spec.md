## Purpose

Cho người nhận gậy xin xét lại đúng một lần, do một người khác người ra gậy xét trong hạn, để gậy sai được
huỷ mà gậy nặng, gậy nghiêm trọng không tự rơi chỉ vì thiếu người xét (TK 22, cam kết 10).

## ADDED Requirements

### Requirement: Khiếu nại một lần trong 14 ngày

Người nhận một gậy thường hoặc gậy nặng SHALL khiếu nại được gậy đó ngay trong app, một lần, trong 14 ngày kể
từ khi nhận gậy (giá trị khởi đầu). Trong lúc khiếu nại chờ xét, gậy MUST vẫn giữ hiệu lực.

#### Scenario: Khiếu nại trong hạn

- **WHEN** người nhận một gậy thường gửi khiếu nại ở ngày thứ 10
- **THEN** response có HTTP 201, khiếu nại ở trạng thái chờ xét và gậy vẫn tính điểm

#### Scenario: Quá hạn khiếu nại

- **WHEN** người nhận gậy gửi khiếu nại ở ngày thứ 15
- **THEN** response có HTTP 409 `APPEAL_WINDOW_CLOSED`

#### Scenario: Khiếu nại lần hai

- **WHEN** người đã khiếu nại một gậy gửi khiếu nại về chính gậy đó lần nữa
- **THEN** response có HTTP 409 `APPEAL_ALREADY_USED`

#### Scenario: Gậy của người khác

- **WHEN** người dùng gửi khiếu nại về một gậy không phải của mình
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Người xét khác người ra gậy

Khiếu nại về gậy thường hoặc gậy nặng SHALL do một staff khác của danh mục xét; danh mục chỉ có một staff,
hoặc gậy đến từ báo cáo về người, thì master xét; gậy do master ra thì master tự xem lại và quyết định là cuối
cùng. Khiếu nại về gậy nghiêm trọng SHALL chỉ vào hàng chờ của master (`trust/serious-strikes`). Người ra gậy
(trừ master với gậy thường, nặng), người nhận gậy và tài khoản dùng chung thiết bị với một trong hai MUST NOT
xét được khiếu nại đó.

#### Scenario: Danh mục có nhiều staff

- **WHEN** staff A ra gậy và người nhận gậy khiếu nại
- **THEN** khiếu nại hiện trong hàng chờ của các staff khác của danh mục, không hiện trong hàng chờ của A

#### Scenario: Người ra gậy tự xét

- **WHEN** staff A quyết khiếu nại về gậy do chính A ra
- **THEN** response có HTTP 403 `FORBIDDEN` và khiếu nại vẫn chờ xét

#### Scenario: Staff dùng chung thiết bị với người ra gậy

- **WHEN** một staff dùng chung thiết bị với người ra gậy quyết khiếu nại đó
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Danh mục chỉ có một staff

- **WHEN** gậy do staff duy nhất của danh mục ra bị khiếu nại
- **THEN** khiếu nại vào hàng chờ của master

#### Scenario: Gậy đến từ báo cáo về người

- **WHEN** gậy do staff được giao việc an toàn ra khi xử báo cáo về một người bị khiếu nại
- **THEN** khiếu nại vào hàng chờ của master

#### Scenario: Gậy do master ra

- **WHEN** gậy do master ra bị khiếu nại
- **THEN** master xét khiếu nại đó và không staff nào thấy nó trong hàng chờ

#### Scenario: Khiếu nại gậy nghiêm trọng

- **WHEN** gậy nghiêm trọng do staff ra bị khiếu nại qua kênh hỗ trợ
- **THEN** khiếu nại vào hàng chờ của master và không vào hàng chờ xét của staff nào, kể cả staff khác của danh
  mục

### Requirement: Hạn xét 7 ngày

Mỗi khiếu nại SHALL được xét trong 7 ngày (giá trị khởi đầu). Quá hạn mà chưa ai quyết thì khiếu nại về gậy
thường SHALL tự thắng; khiếu nại về gậy nặng SHALL chuyển master nếu chưa ở master; khiếu nại về gậy nghiêm
trọng, vốn ở master, SHALL được nhắc master mỗi ngày tới khi có quyết định. Gậy nặng và gậy nghiêm trọng MUST
giữ nguyên hiệu lực — tài khoản bị khoá vẫn khoá — tới khi có người quyết.

#### Scenario: Gậy thường quá hạn xét

- **WHEN** khiếu nại về một gậy thường đã chờ 7 ngày mà chưa ai quyết
- **THEN** khiếu nại thắng với đúng hệ quả như khi người xét chấp nhận

#### Scenario: Gậy nặng quá hạn xét

- **WHEN** khiếu nại về một gậy nặng đã chờ 7 ngày mà chưa ai quyết
- **THEN** khiếu nại chuyển vào hàng chờ của master và gậy vẫn tính 2 điểm

#### Scenario: Gậy nặng vẫn chờ ở master

- **WHEN** khiếu nại về gậy nặng đã nằm ở hàng chờ của master thêm 10 ngày
- **THEN** gậy vẫn còn hiệu lực và khiếu nại không tự thắng

#### Scenario: Gậy nghiêm trọng quá hạn xét

- **WHEN** khiếu nại về một gậy nghiêm trọng đã chờ master 7 ngày mà chưa có quyết định
- **THEN** khiếu nại không tự thắng, tài khoản vẫn khoá, và master được nhắc mỗi ngày tới khi quyết

### Requirement: Khiếu nại thắng

Khi người xét chấp nhận khiếu nại, gậy SHALL bị huỷ ngay: không bị xoá, vẫn còn trong lịch sử với dấu "đã
huỷ", và thôi tính điểm. Tin bị từ chối hay bị gỡ kèm gậy đó SHALL trở lại hiển thị.

#### Scenario: Thắng khiếu nại về tin bị gỡ

- **WHEN** người xét chấp nhận khiếu nại về một gậy thường đi kèm một tin bị gỡ vì vi phạm
- **THEN** gậy ở trạng thái đã huỷ và vẫn có trong lịch sử, điểm gậy giảm 1, tin trở lại đang hiển thị

#### Scenario: Thắng khiếu nại về gậy không gắn tin

- **WHEN** master chấp nhận khiếu nại về một gậy ra khi xử báo cáo về người
- **THEN** gậy ở trạng thái đã huỷ và không tin nào đổi trạng thái

### Requirement: Khiếu nại thua

Khi người xét bác khiếu nại, gậy SHALL chạy tiếp tới đúng ngày hết hạn ban đầu, và người nhận gậy MUST NOT
khiếu nại gậy đó lần nữa.

#### Scenario: Bác khiếu nại

- **WHEN** người xét bác khiếu nại về một gậy thường
- **THEN** ngày hết hạn của gậy không đổi và tin đi kèm vẫn bị gỡ

#### Scenario: Khiếu nại lại sau khi thua

- **WHEN** người vừa thua khiếu nại gửi khiếu nại lần nữa về gậy đó
- **THEN** response có HTTP 409 `APPEAL_ALREADY_USED`
