## ADDED Requirements

### Requirement: Thời gian chờ đang áp dụng

Khi người dùng đang trong thời gian chờ vì dò cổng cứng, bảng uy tín SHALL cho biết đang trong thời gian chờ và
thời điểm được gửi tin lại. Bảng uy tín MUST NOT nêu cổng cứng nào đã bị trúng.

#### Scenario: Đang trong thời gian chờ

- **WHEN** người dùng vừa dính cổng cứng lần thứ 3 trong 24 giờ rồi mở bảng uy tín
- **THEN** bảng ghi đang trong thời gian chờ kèm thời điểm được gửi tin lại, không nêu cổng cứng nào

#### Scenario: Hết thời gian chờ

- **WHEN** thời gian chờ của người dùng đã hết
- **THEN** bảng uy tín không còn ghi thời gian chờ
