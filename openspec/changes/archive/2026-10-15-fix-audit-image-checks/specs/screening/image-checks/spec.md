## ADDED Requirements

### Requirement: Mọi ảnh của lượt gửi đều được kiểm

Mọi ảnh của một lượt gửi SHALL được kiểm, kể cả khi lượt đó đã kết luận trước khi ảnh có kết quả (chấm chữ lỗi,
quá hạn): ảnh đã kiểm là ứng viên so trùng cho mọi tin gửi sau. Ảnh chờ kết quả quá thời gian chờ ảnh (5 phút,
giá trị khởi đầu) SHALL được xếp kiểm lại, mỗi ảnh tối đa một lần trong mỗi khoảng chờ (chốt 15/10/2026).

#### Scenario: Chấm chữ lỗi vẫn kiểm ảnh

- **WHEN** việc chấm chữ báo lỗi lúc một tin 2 ảnh được gửi
- **THEN** kết quả máy là giữ cho người, và cả 2 ảnh vẫn được kiểm, có kết quả

#### Scenario: Ảnh kẹt chờ kiểm

- **WHEN** một ảnh chờ kết quả đã hơn 5 phút mà việc kiểm chưa chạy, và lượt rà chạy hai lần liền nhau
- **THEN** ảnh được xếp kiểm lại đúng một lần
