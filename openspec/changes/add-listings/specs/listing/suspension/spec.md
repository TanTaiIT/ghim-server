## Purpose

Giấu tạm một tin vì lý do nằm ngoài chính tin đó — tài khoản, nhóm, danh mục — mà không phạt người đăng, và trả
tin về đúng như cũ khi hết lý do (TK 3, TK 4 nguyên tắc 9, TK 7, TK 9, TK 10, TK 11, TK 19).

## ADDED Requirements

### Requirement: Tạm ẩn là cờ có lý do, hết mọi lý do mới hiện lại

Một tin SHALL tạm ẩn khi còn ít nhất một lý do tạm ẩn; mỗi lý do đặt và gỡ độc lập. Tin chỉ hiện lại khi hết
mọi lý do, và MUST trở về đúng trạng thái, nơi đăng, mức hiển thị như trước khi ẩn.

#### Scenario: Hai lý do cùng lúc

- **WHEN** một tin trong nhóm đang tạm ẩn vì nhóm bị tạm khoá thì danh mục của nó cũng bị tắt, rồi nhóm được
  mở khoá
- **THEN** tin vẫn tạm ẩn vì danh mục bị tắt

#### Scenario: Hết lý do cuối cùng

- **WHEN** danh mục của tin đó được bật lại
- **THEN** tin hiện lại ở đúng trạng thái, nơi đăng và mức hiển thị như trước khi bị ẩn

### Requirement: Người đăng thấy tin tạm ẩn của mình và lý do

Người đăng SHALL xem được tin của mình đang tạm ẩn cùng mọi lý do tạm ẩn còn hiệu lực, để biết tin đang ở đâu và
khi nào hiện lại (TK 4 nguyên tắc 8).

#### Scenario: Xem tin đang tạm ẩn

- **WHEN** người đăng mở tin của mình đang tạm ẩn vì nhóm bị tạm khoá
- **THEN** người đăng thấy tin cùng lý do "nhóm bị tạm khoá"

### Requirement: Hiện lại không phụ thuộc hạn mức

Tin hết mọi lý do tạm ẩn SHALL hiện lại ngay, kể cả khi số tin sống của người đăng đã bằng hoặc vượt hạn mức
(trust/quotas).

#### Scenario: Hiện lại khi đã đủ hạn mức

- **WHEN** nhóm được mở khoá lúc người đăng đã có số tin sống bằng trần của mức mình
- **THEN** các tin của người đó trong nhóm vẫn hiện lại

### Requirement: Tài khoản người đăng bị khoá

Khi tài khoản bị khoá, mọi tin của người đó SHALL tạm ẩn với lý do "tài khoản bị khoá"; mở khoá thì lý do này
được gỡ.

#### Scenario: Khoá tài khoản

- **WHEN** master khoá một tài khoản có tin đang hiển thị
- **THEN** người khác mở các tin đó nhận HTTP 404 `NOT_FOUND`, và tin không còn trên bảng tin, tìm kiếm hay hồ
  sơ

#### Scenario: Mở khoá

- **WHEN** master mở khoá tài khoản đó
- **THEN** các tin hiện lại như trước khi khoá

### Requirement: Tài khoản người đăng đã xoá

Khi người dùng xoá tài khoản, mọi tin của người đó SHALL ẩn ngay với lý do "tài khoản đã xoá" và MUST NOT hiện
lại.

#### Scenario: Xoá tài khoản

- **WHEN** người dùng có tin đang hiển thị xoá tài khoản
- **THEN** người khác mở các tin đó nhận HTTP 404 `NOT_FOUND`, và tin không còn ở bất kỳ đâu

### Requirement: Người đăng rời nhóm

Khi người đăng tự rời, bị gỡ hay bị cấm khỏi một nhóm, tin "chỉ thành viên" của người đó trong nhóm SHALL tạm ẩn
với lý do "đã rời nhóm"; vào lại nhóm thì lý do này được gỡ.

#### Scenario: Tự rời nhóm

- **WHEN** người đăng có một tin "chỉ thành viên" trong nhóm X và một tin sàn chung tự rời nhóm X
- **THEN** tin "chỉ thành viên" tạm ẩn, còn tin sàn chung vẫn hiện như cũ

#### Scenario: Vào lại nhóm

- **WHEN** người đó vào lại nhóm X
- **THEN** tin "chỉ thành viên" hiện lại

#### Scenario: Bị cấm khỏi nhóm

- **WHEN** điều hành viên cấm người đăng khỏi nhóm X
- **THEN** tin "chỉ thành viên" của người đó trong nhóm X tạm ẩn với lý do "đã rời nhóm"

### Requirement: Nhóm bị tạm khoá

Khi một nhóm bị tạm khoá, mọi tin trong nhóm SHALL tạm ẩn với lý do "nhóm bị tạm khoá"; mở khoá thì lý do này
được gỡ.

#### Scenario: Khoá nhóm

- **WHEN** master tạm khoá một nhóm có tin "chỉ thành viên" và tin "nhóm công khai"
- **THEN** cả hai tin tạm ẩn, còn tin sàn chung của các thành viên vẫn hiện

#### Scenario: Mở khoá nhóm

- **WHEN** master mở khoá nhóm đó
- **THEN** cả hai tin hiện lại đúng như cũ

### Requirement: Nhóm đã đóng

Khi nhóm đóng, mọi tin trong nhóm SHALL rời bảng ngay với lý do "nhóm đã đóng" và MUST NOT hiện lại trong nhóm
đó.

#### Scenario: Đóng nhóm

- **WHEN** chủ nhóm đóng một nhóm có tin đang hiển thị
- **THEN** người khác mở các tin đó nhận HTTP 404 `NOT_FOUND`, và tin không còn trong bảng tin của nhóm

### Requirement: Chuyển tin đã rời nhóm lên sàn chung

Tin rời nhóm vì nhóm đóng, hoặc tin của người ngoài rời nhóm vì nhóm sang riêng tư, SHALL được người đăng chuyển
lên sàn chung trong 30 ngày (giá trị khởi đầu) kể từ lúc rời nhóm. Tin chuyển qua máy như một tin mới gửi lên
sàn chung, theo mọi điều kiện gửi. Quá hạn thì MUST bị từ chối.

#### Scenario: Chuyển trong hạn

- **WHEN** 10 ngày sau khi nhóm đóng, người đăng chuyển tin của mình trong nhóm đó lên sàn chung, có đủ tỉnh
  và phường
- **THEN** tin chuyển sang đang kiểm với nơi đăng sàn chung

#### Scenario: Chuyển khi thiếu khu vực

- **WHEN** người đăng chuyển lên sàn chung một tin đã rời nhóm chưa có phường
- **THEN** response có HTTP 400 `REGION_REQUIRED` và tin không đổi

#### Scenario: Quá hạn chuyển

- **WHEN** 31 ngày sau khi nhóm đóng, người đăng chuyển tin trong nhóm đó lên sàn chung
- **THEN** response có HTTP 409 `MOVE_WINDOW_EXPIRED` và tin không đổi

### Requirement: Nhóm sang riêng tư thì hạ tin "nhóm công khai" trước

Khi nhóm đổi từ công khai sang riêng tư, mọi tin "nhóm công khai" của thành viên SHALL được hạ về "chỉ thành
viên", không qua máy, trước khi nhóm thành riêng tư. MUST NOT có lúc nào một tin "nhóm công khai" nằm dưới một
nhóm riêng tư (TK 27 cam kết 22).

#### Scenario: Đổi sang riêng tư

- **WHEN** chủ nhóm đổi một nhóm công khai có tin "nhóm công khai" của thành viên sang riêng tư
- **THEN** các tin đó thành "chỉ thành viên": khách không còn mở được, thành viên vẫn thấy, tin vẫn đang hiển
  thị

#### Scenario: Không có khoảnh khắc lệch

- **WHEN** ai đó xem nhóm vào bất kỳ thời điểm nào trong lúc nhóm đang chuyển sang riêng tư
- **THEN** không có lúc nào nhóm đã là riêng tư mà vẫn còn tin "nhóm công khai"

### Requirement: Nhóm sang riêng tư thì tin của người ngoài rời nhóm

Khi nhóm đổi từ công khai sang riêng tư, tin của người ngoài trong nhóm SHALL rời nhóm với lý do "nhóm sang
riêng tư" — không phải án phạt — và MUST NOT hiện lại trong nhóm đó.

#### Scenario: Tin của người ngoài

- **WHEN** nhóm có một tin "nhóm công khai" của người ngoài đổi sang riêng tư
- **THEN** tin đó không còn hiện trong nhóm, và người đăng thấy tin với lý do "nhóm sang riêng tư"

### Requirement: Không đăng mức "nhóm công khai" khi nhóm đang chuyển sang riêng tư

Trong lúc nhóm đang chuyển sang riêng tư, MUST NOT có tin nào được gửi vào hay mở rộng lên mức "nhóm công
khai" của nhóm đó. Tin "chỉ thành viên" vẫn gửi được.

#### Scenario: Gửi tin "nhóm công khai" trong lúc chuyển

- **WHEN** thành viên gửi tin mức "nhóm công khai" vào nhóm đang chuyển sang riêng tư
- **THEN** response có HTTP 409 `GROUP_MODE_CHANGING` và nháp vẫn là nháp

#### Scenario: Gửi tin "chỉ thành viên" trong lúc chuyển

- **WHEN** thành viên gửi tin "chỉ thành viên" vào nhóm đang chuyển sang riêng tư
- **THEN** tin được gửi và chuyển sang đang kiểm

### Requirement: Nhóm sang công khai không tự công khai tin

Khi nhóm đổi từ riêng tư sang công khai, tin "chỉ thành viên" SHALL giữ nguyên mức; MUST NOT tự thành "nhóm
công khai".

#### Scenario: Đổi sang công khai

- **WHEN** chủ nhóm đổi một nhóm riêng tư có tin "chỉ thành viên" sang công khai
- **THEN** các tin đó vẫn "chỉ thành viên" và khách mở tin nhận HTTP 404 `NOT_FOUND`

### Requirement: Danh mục bị tắt

Khi một danh mục bị tắt, mọi tin trong danh mục SHALL tạm ẩn với lý do "danh mục bị tắt"; bật lại thì lý do này
được gỡ. Người đăng SHALL đổi được tin sang một danh mục đang bật — tin qua máy lại và lý do được gỡ.

#### Scenario: Tắt danh mục

- **WHEN** master tắt một danh mục có tin đang hiển thị
- **THEN** các tin đó tạm ẩn với lý do "danh mục bị tắt"

#### Scenario: Bật lại danh mục

- **WHEN** master bật lại danh mục đó
- **THEN** các tin hiện lại đúng như cũ

#### Scenario: Đổi sang danh mục khác

- **WHEN** người đăng đổi một tin đang tạm ẩn vì danh mục bị tắt sang một danh mục đang bật
- **THEN** lý do "danh mục bị tắt" được gỡ và tin chuyển sang đang kiểm
