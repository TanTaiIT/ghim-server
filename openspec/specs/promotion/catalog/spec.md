# promotion/catalog Specification

## Purpose
Bảng gói đẩy tin áp toàn sàn, master soạn, người đăng đọc trước khi mua (kế hoạch gói đẩy tin mục 4.1, 4.2).

## Requirements

### Requirement: Master soạn gói

Master SHALL tạo, sửa, bật tắt gói với mã duy nhất, tên, mô tả, hiệu ứng (`rank_to_top` hoặc `featured`), thời hạn (ngày,
bắt buộc với `featured`), thời gian chờ giữa hai lần mua cho cùng một tin, giá Xu, mức tin cậy tối thiểu, phạm vi (sàn
chung, nhóm, cả hai) và thứ tự hiện. Mọi thao tác SHALL vào nhật ký bất biến. Gói MUST NOT bị xoá — chỉ tắt, vì lượt mua
đã có trỏ tới nó.

#### Scenario: Tạo gói nổi bật thiếu thời hạn

- **WHEN** master tạo gói hiệu ứng `featured` mà không có thời hạn
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và không gói nào được tạo

#### Scenario: Tắt gói đang có người dùng

- **WHEN** master tắt một gói có lượt mua còn hiệu lực
- **THEN** lượt mua đó chạy tới hết hạn như thường, gói không còn trong danh sách người đăng thấy

### Requirement: Bộ gói khởi đầu

Bảng gói trống SHALL được chèn bộ khởi đầu ở bước khởi động, đang bật, phạm vi cả sàn chung lẫn nhóm, mức tối thiểu T1:
"Đẩy lên đầu" (`rank_to_top`) 1 Xu, "Nổi bật 3 ngày" (`featured`) 2 Xu, "Nổi bật 7 ngày" (`featured`) 4 Xu. Bảng đã có
gói MUST NOT bị chèn lại — master đã sửa thì giữ bản của master.

#### Scenario: Lần khởi động đầu

- **WHEN** server khởi động với bảng gói trống
- **THEN** bảng có ba gói khởi đầu với đúng giá và thời hạn trên

#### Scenario: Master đã đổi giá

- **WHEN** master đổi giá "Đẩy lên đầu" thành 2 Xu rồi server khởi động lại
- **THEN** gói vẫn giá 2 Xu, không có gói nào được chèn thêm

### Requirement: Người đăng thấy gói mua được

Người đăng SHALL thấy các gói đang bật hợp với phạm vi của tin, kèm giá và điều kiện; gói mình chưa đủ mức SHALL hiện kèm
lý do chưa mua được thay vì ẩn đi (TK 4 nguyên tắc 8).

#### Scenario: Gói cho tin sàn chung

- **WHEN** người đăng ở T1 xem gói cho một tin sàn chung
- **THEN** danh sách gồm các gói đang bật có phạm vi sàn chung, mỗi gói nêu giá, thời hạn và có mua được không

#### Scenario: Chưa đủ mức

- **WHEN** người đăng ở T0 xem gói có mức tối thiểu T1
- **THEN** gói vẫn hiện với lý do "cần mức T1", không mua được
