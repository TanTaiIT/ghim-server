## MODIFIED Requirements

### Requirement: Tin dính cổng cứng luôn giữ cho người

Tin dính ít nhất một cổng cứng — cụm từ cấm mức chắc, ảnh trùng với tin của tài khoản khác, giá vượt trần danh
mục — SHALL bị giữ cho người, bất kể điểm rủi ro, dải và mức tin cậy. Máy không kiểm nội dung ảnh nên không có cổng
"ảnh nhạy cảm" (chốt 24/10/2026).

#### Scenario: Tài khoản T3 dùng ảnh của người khác

- **WHEN** tài khoản T3 gửi một tin không trúng dấu hiệu rủi ro nào nhưng có một ảnh gần như giống hệt ảnh trong
  tin của tài khoản khác
- **THEN** kết quả máy là giữ cho người

#### Scenario: Cụm từ cấm mức chắc trong tin nhóm

- **WHEN** tài khoản T2 gửi vào nhóm, ở mức "chỉ thành viên", một tin chứa cụm từ cấm mức chắc
- **THEN** kết quả máy là giữ cho người

### Requirement: Chỉ cổng cứng mới tính là dò

Chỉ cổng cứng SHALL được đếm vào lượt dò. Tin bị giữ vì danh mục luôn duyệt tay, vì đánh dấu theo thiết
bị, vì chất lượng ảnh, vì điểm rủi ro hay vì lỗi của máy MUST NOT được đếm — để người dùng thật không bị chặn đăng
(TK 8).

#### Scenario: Ba tin thú cưng trong một ngày

- **WHEN** một tài khoản gửi 3 tin vào danh mục bật luôn duyệt tay trong 24 giờ, không tin nào dính cổng
  cứng
- **THEN** cả ba tin bị giữ cho người và tài khoản không vào thời gian chờ

#### Scenario: Tài khoản bị đánh dấu theo thiết bị gửi nhiều tin

- **WHEN** tài khoản đang bị đánh dấu "nhiều tài khoản trên một máy" gửi 3 tin trong 24 giờ, không tin nào
  dính cổng cứng
- **THEN** cả ba tin bị giữ cho người và tài khoản không vào thời gian chờ

#### Scenario: Ba tin ảnh mờ trong một ngày

- **WHEN** luật "ảnh mờ" đang bật và một tài khoản gửi 3 tin có ảnh mờ trong 24 giờ, không tin nào dính cổng cứng
- **THEN** cả ba tin bị giữ cho người và tài khoản không vào thời gian chờ
