## ADDED Requirements

### Requirement: Lý do hạn chế "gậy" cho tin lên bảng khi người bán có gậy

Tin lên bảng, hoặc hiện lại sau tạm ẩn, trong lúc người bán đang có gậy còn hiệu lực SHALL mang lý do hạn chế
"gậy". Lý do này SHALL gỡ khi điểm gậy của người bán về 0, độc lập với các lý do hạn chế khác. Tin đã đang hiển
thị lúc người bán nhận gậy MUST NOT bị đặt lý do này khi điểm gậy còn dưới 2.

#### Scenario: Gậy đầu tiên

- **WHEN** người bán có 20 tin đang hiển thị đầy đủ nhận gậy thường đầu tiên, rồi đăng một tin mới được máy
  cho qua
- **THEN** 20 tin cũ vẫn hiển thị đầy đủ, còn tin mới hiển thị hạn chế với lý do "gậy"

#### Scenario: Người duyệt cho đạt tin máy giữ

- **WHEN** người duyệt cho đạt một tin máy giữ của người bán đang có gậy
- **THEN** tin lên bảng ở mức hạn chế với lý do "gậy"

#### Scenario: Hiện lại sau tạm ẩn

- **WHEN** một nhóm được mở khoá và tin trong nhóm của một người bán đang có gậy hiện lại
- **THEN** tin hiện lại ở mức hạn chế với lý do "gậy"

#### Scenario: Điểm gậy về 0

- **WHEN** gậy duy nhất của người bán hết hạn
- **THEN** lý do "gậy" được gỡ khỏi mọi tin của người đó

#### Scenario: Tin còn lý do khác

- **WHEN** một tin mang cả lý do "gậy" lẫn lý do "máy" và điểm gậy của người bán về 0
- **THEN** tin vẫn hiển thị hạn chế vì lý do "máy"

#### Scenario: Gậy bị huỷ

- **WHEN** gậy duy nhất của người bán bị huỷ vì khiếu nại thắng
- **THEN** lý do "gậy" được gỡ ngay, không chờ ngày hết hạn ban đầu của gậy

### Requirement: Điểm gậy chạm 2 thì mọi tin đang hiển thị bị hạn chế

Khi điểm gậy của người bán lên từ 2 trở lên, mọi tin đang hiển thị của người đó SHALL mang lý do hạn chế "gậy",
vẫn xem được qua tìm kiếm có từ khoá, hồ sơ người bán và đường link trực tiếp. Lý do đặt ở mốc này SHALL gỡ khi
điểm gậy về dưới 2.

#### Scenario: Gậy thứ hai

- **WHEN** người bán đang có 1 điểm và 20 tin hiển thị đầy đủ nhận thêm một gậy thường
- **THEN** cả 20 tin chuyển sang hạn chế với lý do "gậy": rời bảng tin và gợi ý, vẫn tìm thấy bằng từ khoá và
  trên hồ sơ người bán

#### Scenario: Điểm về dưới 2

- **WHEN** gậy thứ nhất của người bán đó hết hạn và điểm gậy về 1
- **THEN** 20 tin đó trở lại hiển thị đầy đủ

#### Scenario: Tin đăng trong lúc có gậy

- **WHEN** người bán đăng một tin lúc đang có 2 điểm, rồi điểm gậy về 1
- **THEN** tin đó vẫn hạn chế với lý do "gậy" tới khi điểm gậy về 0

#### Scenario: Một gậy nặng

- **WHEN** người bán chưa có gậy nhận một gậy nặng
- **THEN** mọi tin đang hiển thị của người đó chuyển sang hạn chế ngay
