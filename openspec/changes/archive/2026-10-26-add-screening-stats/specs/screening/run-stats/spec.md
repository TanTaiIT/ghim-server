## Purpose

Cho master biết máy duyệt đang làm việc ra sao qua từng tháng — cho qua, giữ, dải điểm, luật trúng nhiều — kể cả những
tháng mà kết quả chi tiết đã được gộp khi hết hạn lưu (TK 25).

## ADDED Requirements

### Requirement: Master xem số liệu máy theo tháng

Master SHALL xem được, cho từng tháng trong khoảng mặc định 12 tháng gần nhất (tối đa 24), số lượt máy đã kết luận chia
theo kết quả và theo dải điểm; tháng không có lượt nào SHALL có số 0. Số liệu SHALL cộng lượt còn chi tiết với số đã gộp
khi hết hạn lưu. Lượt chưa kết luận MUST NOT được đếm.

#### Scenario: Tháng có lượt chi tiết

- **WHEN** tháng này có hai lượt cho qua đầy đủ dải Thấp, một lượt giữ dải Cao và một lượt chưa kết luận
- **THEN** response có HTTP 200, dòng tháng này có 3 lượt: 2 cho qua đầy đủ, 1 giữ, 2 dải Thấp, 1 dải Cao

#### Scenario: Tháng đã gộp

- **WHEN** năm lượt giữ dải Cao của một tháng trong khoảng đã được gộp khi hết hạn lưu
- **THEN** dòng tháng đó có 5 lượt giữ dải Cao

#### Scenario: Khoảng dài hơn

- **WHEN** master xem với `months=24`
- **THEN** response có 24 tháng, gồm cả tháng đã gộp nằm ngoài 12 tháng gần nhất

#### Scenario: Khoảng không hợp lệ

- **WHEN** master xem với `months=25`
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

### Requirement: Luật trúng nhiều nhất

Số liệu SHALL kèm tối đa 5 luật trúng nhiều lượt nhất trong cả khoảng, mỗi luật kèm tên và số lượt; một lượt trúng một luật
nhiều lần MUST chỉ tính một.

#### Scenario: Một lượt trúng một luật hai lần

- **WHEN** một lượt trúng luật A hai lần và luật B một lần, một lượt khác trúng luật A, và số đã gộp có năm lượt trúng
  luật A
- **THEN** luật A có 7 lượt, luật B có 1 lượt, luật A đứng trước

### Requirement: Chỉ master xem số liệu máy

Số liệu máy MUST chỉ dành cho master.

#### Scenario: Staff xem số liệu

- **WHEN** một staff mở số liệu máy
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Khách xem số liệu

- **WHEN** người chưa đăng nhập mở số liệu máy
- **THEN** response có HTTP 401 `UNAUTHORIZED`
