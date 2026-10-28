## MODIFIED Requirements

### Requirement: Tin đang hiển thị hạn chế và lý do

Bảng uy tín SHALL liệt kê mọi tin đang hiển thị hạn chế của người dùng, mỗi tin kèm mọi lý do hạn chế đang còn
hiệu lực của nó. Mức tin cậy MUST NOT xuất hiện như một lý do: tin của người ở mức T0 mà máy cho qua đầy đủ không nằm
trong danh sách này.

#### Scenario: Tin của tài khoản mới

- **WHEN** người dùng ở mức T0 có một tin sàn chung máy cho qua đầy đủ
- **THEN** danh sách tin hiển thị hạn chế của người đó không có tin ấy (mức tin cậy không còn là lý do hạn chế, chốt
  28/10/2026)

#### Scenario: Lên T1

- **WHEN** người dùng ở mức T1 có một tin trên sàn chung đang hiển thị hạn chế vì lý do "máy", rồi người hậu kiểm cho
  tin đạt
- **THEN** bảng uy tín liệt kê tin đó kèm lý do "máy" tới lúc cho đạt, sau đó tin không còn trong danh sách
