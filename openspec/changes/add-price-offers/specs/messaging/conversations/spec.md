## ADDED Requirements

### Requirement: Hội thoại cho biết tin và người kia

Mỗi hội thoại một bên thấy SHALL cho biết đủ để vẽ đầu hội thoại mà không phải gọi thêm: tiêu đề, giá, có cho thương
lượng không, trạng thái và ảnh bìa của tin; ảnh đại diện của người kia; và người xem lúc này có gửi được đề nghị giá
không. Tin đã bị xoá thì tiêu đề, giá và ảnh bìa MUST để trống. Tin bị gỡ vì vi phạm MUST NOT kèm ảnh bìa (chốt
18/10/2026).

#### Scenario: Hội thoại về tin đang hiển thị

- **WHEN** người mua mở hội thoại về một tin đang hiển thị, cho thương lượng, giá 12.500.000 đồng, có 3 ảnh
- **THEN** hội thoại có tiêu đề, giá 12.500.000 đồng, cờ cho thương lượng, trạng thái đang hiển thị và ảnh đầu tiên của
  tin làm ảnh bìa

#### Scenario: Ảnh đại diện người kia

- **WHEN** người bán có ảnh đại diện và người mua xem danh sách hội thoại của mình
- **THEN** hội thoại với người bán đó kèm ảnh đại diện của người bán

#### Scenario: Người kia đã xoá tài khoản

- **WHEN** người bán đã xoá tài khoản và người mua xem hội thoại với họ
- **THEN** hội thoại không kèm ảnh đại diện, và cho biết người kia đã rời Ghim

#### Scenario: Tin đã bị xoá

- **WHEN** người đăng xoá tin sau khi đã có hội thoại về tin đó
- **THEN** hội thoại vẫn đọc được, tiêu đề, giá và ảnh bìa để trống

#### Scenario: Tin bị gỡ vì vi phạm

- **WHEN** người duyệt gỡ tin của một hội thoại vì vi phạm
- **THEN** hội thoại vẫn có tiêu đề và giá của tin, trạng thái bị gỡ, không có ảnh bìa

#### Scenario: Người mua trả giá được

- **WHEN** người mua xem hội thoại về một tin đang hiển thị, cho thương lượng, giá lớn hơn 0, không có chặn giữa hai bên
- **THEN** hội thoại cho biết người mua gửi được đề nghị giá

#### Scenario: Người bán không trả giá

- **WHEN** người bán xem cùng hội thoại đó
- **THEN** hội thoại cho biết người bán không gửi được đề nghị giá

#### Scenario: Tin đã bán

- **WHEN** người mua xem hội thoại về một tin đã bán
- **THEN** hội thoại cho biết người mua không gửi được đề nghị giá, nhưng vẫn gửi được tin nhắn
