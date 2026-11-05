## MODIFIED Requirements

### Requirement: Master soạn gói

Master SHALL tạo, sửa, bật tắt gói với mã duy nhất, tên, mô tả, hiệu ứng (`rank_to_top` hoặc `featured`), thời hạn (ngày,
bắt buộc với `featured`), thời gian chờ giữa hai lần mua cho cùng một tin, giá Xu, phạm vi (sàn chung, nhóm, cả hai) và
thứ tự hiện. Gói MUST NOT mang mức tin cậy tối thiểu (chốt 03/11/2026). Mọi thao tác SHALL vào nhật ký bất biến. Gói MUST
NOT bị xoá — chỉ tắt, vì lượt mua đã có trỏ tới nó.

#### Scenario: Tạo gói nổi bật thiếu thời hạn

- **WHEN** master tạo gói hiệu ứng `featured` mà không có thời hạn
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không gói nào được tạo

#### Scenario: Tắt gói đang có người dùng

- **WHEN** master tắt một gói có lượt mua còn hiệu lực
- **THEN** lượt mua đó chạy tới hết hạn như thường, gói không còn trong danh sách người đăng thấy

#### Scenario: Gửi kèm mức tối thiểu

- **WHEN** master tạo gói và body có trường `minTier`
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không gói nào được tạo

### Requirement: Bộ gói khởi đầu

Bảng gói trống SHALL được chèn bộ khởi đầu ở bước khởi động, đang bật, phạm vi cả sàn chung lẫn nhóm: "Đẩy lên đầu"
(`rank_to_top`) 1 Xu, "Nổi bật 3 ngày" (`featured`) 2 Xu, "Nổi bật 7 ngày" (`featured`) 4 Xu. Bảng đã có gói MUST NOT bị
chèn lại — master đã sửa thì giữ bản của master.

#### Scenario: Lần khởi động đầu

- **WHEN** server khởi động với bảng gói trống
- **THEN** bảng có ba gói khởi đầu với đúng giá và thời hạn trên

#### Scenario: Master đã đổi giá

- **WHEN** master đổi giá "Đẩy lên đầu" thành 2 Xu rồi server khởi động lại
- **THEN** gói vẫn giá 2 Xu, không có gói nào được chèn thêm

## ADDED Requirements

### Requirement: Người đăng thấy gói, không xét mức tin cậy

Người đăng SHALL thấy các gói đang bật hợp với phạm vi của tin, kèm giá và điều kiện; gói chưa mua được SHALL hiện kèm lý
do thay vì ẩn đi (TK 4 nguyên tắc 8). Mức tin cậy của người đăng MUST NOT làm gói chưa mua được.

#### Scenario: Gói cho tin sàn chung

- **WHEN** người đăng ở T1 xem gói cho một tin sàn chung
- **THEN** danh sách gồm các gói đang bật có phạm vi sàn chung, mỗi gói nêu giá, thời hạn và có mua được không

#### Scenario: Người đăng ở T0

- **WHEN** người đăng ở T0 có đủ Xu xem gói cho một tin đang hiển thị đầy đủ
- **THEN** mọi gói hợp phạm vi đều mua được, không gói nào có lý do về mức

## REMOVED Requirements

### Requirement: Người đăng thấy gói mua được

**Reason**: Requirement mang scenario "Chưa đủ mức" (gói hiện kèm lý do "cần mức T1"), mà gói không còn mức tối
thiểu từ 03/11/2026.

**Migration**: Thay bằng "Người đăng thấy gói, không xét mức tin cậy" — giữ luật hiện gói kèm lý do thay vì ẩn; app
không còn nhận lý do về mức.
