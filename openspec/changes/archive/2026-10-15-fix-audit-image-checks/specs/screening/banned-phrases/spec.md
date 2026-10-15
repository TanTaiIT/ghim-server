## ADDED Requirements

### Requirement: Quét lại lần hai sau thời gian chờ ảnh

Sau lượt quét lúc bật thật cụm mức chắc, hệ thống SHALL quét lại tin đang hiển thị thêm một lần, khi đã qua thời
gian chờ kết quả ảnh và một chu kỳ rà: tin đang được chấm lúc bật, lên hiển thị sau lượt quét đầu, cũng bị rút về
chờ duyệt. Lượt quét lần hai MUST NOT rút lại tin đã rút ở lượt đầu (chốt 15/10/2026).

#### Scenario: Tin đang kiểm lúc bật

- **WHEN** một tin có mô tả chứa "bán súng" đang chờ kết quả ảnh lúc master bật thật cụm "bán súng" mức chắc, rồi ảnh có kết quả và tin lên hiển thị
- **THEN** lượt quét lần hai rút tin về chờ duyệt

#### Scenario: Tin đã rút ở lượt đầu

- **WHEN** lượt quét đầu đã rút một tin về chờ duyệt và người duyệt cho đạt trước lượt quét lần hai
- **THEN** lượt quét lần hai không rút lại tin đó
