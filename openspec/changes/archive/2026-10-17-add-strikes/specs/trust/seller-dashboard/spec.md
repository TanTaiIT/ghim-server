## ADDED Requirements

### Requirement: Bảng uy tín liệt kê từng gậy

Bảng uy tín của người bán SHALL liệt kê từng gậy còn hiệu lực với loại, điểm, điều trích làm lý do, ngày ra,
ngày hết hạn và số ngày còn lại, cùng tổng điểm gậy hiện tại.

#### Scenario: Một gậy còn 40 ngày

- **WHEN** người bán có hai gậy thường nhận ở ngày 0 và ngày 40 mở bảng uy tín ở ngày 90
- **THEN** bảng có một gậy thường kèm điều đã trích, hết hạn ở ngày 130, "còn 40 ngày", và điểm gậy hiện tại
  là 1

#### Scenario: Không có gậy

- **WHEN** người bán chưa từng nhận gậy mở bảng uy tín
- **THEN** danh sách gậy rỗng và điểm gậy là 0

### Requirement: Bảng uy tín cho biết ngày hết tạm khoá đăng tin

Khi người bán đang bị tạm khoá đăng tin vì điểm gậy, bảng uy tín SHALL nêu ngày điểm gậy về dưới mốc tạm khoá,
tức ngày người đó gửi tin lại được.

#### Scenario: Gậy nặng và gậy thường

- **WHEN** người bán có một gậy nặng hết hạn ở ngày 150 và một gậy thường hết hạn ở ngày 60, mở bảng uy tín ở
  ngày 10
- **THEN** bảng nêu đang tạm khoá đăng tin tới ngày 60
