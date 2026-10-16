# review/reporter-score Specification

## Purpose

Đo độ tin cậy của từng người báo theo kết quả các báo cáo của họ, để báo cáo bừa mất dần sức nặng mà không biến
thành án phạt (TK 23).

## Requirements

### Requirement: Điểm báo cáo theo kết quả

Mỗi lượt báo bị bác SHALL trừ 1 điểm báo cáo của người đã báo; mỗi lượt báo được xác nhận đúng SHALL cộng 1.
Với báo cáo đã gộp, mỗi người báo được tính riêng.

#### Scenario: Báo cáo gộp bị bác

- **WHEN** một báo cáo có 3 người báo, mỗi người đang có 0 điểm báo cáo, bị người xử bác
- **THEN** mỗi người trong 3 người có −1 điểm báo cáo

#### Scenario: Báo cáo được xác nhận đúng

- **WHEN** một báo cáo của người đang có −2 điểm báo cáo được xác nhận đúng
- **THEN** người đó có −1 điểm báo cáo

### Requirement: Điểm báo cáo bình thường và xếp hàng

Điểm báo cáo từ −3 trở lên SHALL là bình thường. Báo cáo của người có điểm dưới −3 SHALL xếp sau mọi báo cáo
của người có điểm bình thường trong hàng chờ.

#### Scenario: Báo cáo của người điểm thấp tới trước

- **WHEN** báo cáo của một người có −4 điểm vào hàng trước báo cáo của một người có 0 điểm
- **THEN** hàng chờ xếp báo cáo của người có 0 điểm lên trước

#### Scenario: Điểm đúng −3

- **WHEN** một người có đúng −3 điểm báo cáo gửi báo cáo
- **THEN** báo cáo của người đó được xếp như báo cáo của người có điểm bình thường

### Requirement: Mất quyền báo cáo khi điểm quá thấp

Khi điểm báo cáo của một người xuống dưới −6, người đó SHALL mất quyền báo cáo trong 30 ngày (giá trị khởi đầu).
Lượt báo trong thời gian đó MUST bị từ chối kèm ngày được báo cáo lại.

#### Scenario: Báo cáo khi đang mất quyền

- **WHEN** điểm báo cáo của một người xuống −7 và 10 ngày sau người đó gửi báo cáo
- **THEN** response có HTTP 403 `REPORTING_SUSPENDED` kèm ngày được báo cáo lại, và không báo cáo nào được tạo

#### Scenario: Hết 30 ngày

- **WHEN** đã qua 30 ngày kể từ lúc người đó mất quyền báo cáo và người đó gửi báo cáo
- **THEN** response có HTTP 201

### Requirement: Điểm báo cáo không phải án phạt

Điểm báo cáo MUST NOT ảnh hưởng tới mức tin cậy, hạn mức, tin đăng hay gậy của người báo.

#### Scenario: Người đang mất quyền báo cáo vẫn đăng tin

- **WHEN** một người dùng T2 có −7 điểm báo cáo và đang mất quyền báo cáo gửi một tin mới
- **THEN** tin được nhận như thường, người đó vẫn ở T2 và hạn mức không đổi
