# ops/background-jobs Specification

## Purpose

Ba luật chung cho mọi việc hệ thống tự chạy — không chặn nhau, làm dở thì nói ra, không tự mở tin cho người mua —
cùng lịch chạy của việc dọn dữ liệu, việc duy nhất không thuộc module nào (TK 26).

## Requirements

### Requirement: Không việc nào chặn việc khác

Một việc nền chạy lâu hay gặp lỗi MUST NOT làm chậm hay dừng các việc nền khác, và MUST NOT làm chậm thao tác của
người dùng.

#### Scenario: Lượt dọn ảnh chạy lâu

- **WHEN** một lượt dọn ảnh của `media/image-cleanup` đang chạy trên cả kho và một người dùng gửi tin
- **THEN** tin vẫn được máy chấm và lên bảng mà không phải chờ lượt dọn ảnh xong

#### Scenario: Một việc nền gặp lỗi

- **WHEN** lượt dọn dữ liệu hằng ngày gặp lỗi giữa chừng
- **THEN** các việc nền khác, như trả về hàng chờ những việc nhận quá 10 phút, vẫn chạy đúng lịch của chúng

### Requirement: Làm dở thì phải nói ra

Mỗi lượt chạy của một việc nền SHALL ghi lại kết quả là "xong" hay "mới làm được một phần". Lượt bị cắt giữa
chừng MUST NOT được ghi là xong, và phần còn lại SHALL được làm ở lượt sau mà không làm lại phần đã xong.

#### Scenario: Lượt bị cắt giữa chừng

- **WHEN** lượt dọn dữ liệu bị dừng khi mới xử được một phần dữ liệu quá hạn lưu
- **THEN** kết quả lượt đó ghi "mới làm được một phần", không ghi "xong"

#### Scenario: Lượt sau làm tiếp

- **WHEN** lượt dọn kế tiếp chạy sau một lượt mới làm được một phần
- **THEN** dữ liệu quá hạn còn lại được xử, và không người đăng nào nhận hai lần nhắc cho cùng một tin

#### Scenario: Lượt chạy hết

- **WHEN** một lượt dọn xử hết mọi dữ liệu quá hạn lưu
- **THEN** kết quả lượt đó ghi "xong"

### Requirement: Không việc nền nào tự mở tin cho người mua

Việc nền MUST NOT tự quyết làm hiện ra với người mua một tin đang không hiện — đang kiểm, chờ duyệt, bị từ chối,
bị gỡ hay đang tạm ẩn. Việc nền SHALL chỉ làm một tin hiện ra khi đang thi hành một quyết định của người.

#### Scenario: Việc nền chạy trên tin đang chờ duyệt

- **WHEN** bất kỳ việc nền nào chạy trên một tin đang chờ người duyệt mà không có quyết định nào của người về tin
  đó
- **THEN** sau lượt chạy, tin vẫn không hiện với người mua

#### Scenario: Thi hành quyết định của người

- **WHEN** master mở khoá một nhóm và việc nền thi hành hệ quả của quyết định đó lên các tin tạm ẩn vì nhóm bị
  khoá
- **THEN** các tin đó được hiện lại, vì lý do hiện là quyết định của master chứ không phải của việc nền

### Requirement: Lịch dọn dữ liệu

Việc dọn dữ liệu quá hạn lưu, kể cả ẩn danh hoá gậy và nhật ký liên quan, SHALL chạy mỗi ngày; riêng dọn bản
nháp quá hạn SHALL chạy mỗi 6 giờ. Hạn lưu nằm ở `ops/data-retention`; việc dọn của module khác theo capability
của module đó.

#### Scenario: Bản nháp vừa quá hạn

- **WHEN** một bản nháp vừa quá hạn lưu
- **THEN** nháp bị xoá hẳn chậm nhất 6 giờ sau đó

#### Scenario: Dữ liệu khác vừa quá hạn

- **WHEN** một thông báo vừa quá hạn lưu
- **THEN** thông báo bị xoá chậm nhất một ngày sau đó
