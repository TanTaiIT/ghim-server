# trust/seller-dashboard Specification

## Purpose

Cho người bán luôn biết mình đang ở đâu — mức nào, còn thiếu gì để lên, còn đăng được bao nhiêu, tin nào đang
bị giới hạn — mà không dạy cách lách máy duyệt (TK 20, nguyên tắc 8).

## Requirements

### Requirement: Chỉ chủ tài khoản xem bảng uy tín của mình

Người dùng đã đăng nhập SHALL xem được bảng uy tín của chính mình, và chỉ của chính mình. Khách chưa đăng nhập
MUST NOT xem được bảng uy tín nào.

#### Scenario: Xem bảng uy tín của mình

- **WHEN** người dùng đã đăng nhập mở bảng uy tín
- **THEN** response có HTTP 200 với bảng uy tín của chính tài khoản đó

#### Scenario: Khách chưa đăng nhập

- **WHEN** khách chưa đăng nhập mở bảng uy tín
- **THEN** response có HTTP 401 `UNAUTHORIZED`

### Requirement: Mức hiện tại và điều còn thiếu để lên mức

Bảng uy tín SHALL cho biết mức hiện tại, số tin sạch đang được tính, và điều còn thiếu để lên mức kế tiếp: số
ngày tuổi và số tin sạch còn thiếu, theo cùng phiên bản bảng con số đã dùng để tính mức.

#### Scenario: Tài khoản mới

- **WHEN** người dùng ở mức T0, 3 ngày tuổi, chưa có tin sạch, mở bảng uy tín
- **THEN** bảng ghi mức T0 và còn thiếu 4 ngày tuổi cùng 1 tin sạch để lên T1

#### Scenario: Chỉ còn thiếu tin sạch

- **WHEN** người dùng ở mức T1, 40 ngày tuổi, có 3 tin sạch được tính, mở bảng uy tín
- **THEN** bảng ghi còn thiếu 2 tin sạch để lên T2 và không thiếu ngày tuổi nào

#### Scenario: Đã ở mức cao nhất

- **WHEN** người dùng ở mức T3 mở bảng uy tín
- **THEN** bảng ghi mức T3 là mức cao nhất, không có mức kế tiếp

### Requirement: Hạn mức còn lại

Bảng uy tín SHALL cho biết hạn mức còn lại: số tin sống đang có trên trần của mức, số lượt gửi còn lại trong
một giờ gần nhất, và thời điểm có thêm lượt gửi khi đã hết lượt.

#### Scenario: Gần chạm trần

- **WHEN** người dùng ở mức T1 có 18 tin sống và đã dùng 5 lượt gửi trong một giờ gần nhất mở bảng uy tín
- **THEN** bảng ghi 18 trên 20 tin sống, 0 lượt gửi còn lại, kèm thời điểm có lượt gửi kế tiếp

### Requirement: Tin đang hiển thị hạn chế và lý do

Bảng uy tín SHALL liệt kê mọi tin đang hiển thị hạn chế của người dùng, mỗi tin kèm mọi lý do hạn chế đang còn
hiệu lực của nó.

#### Scenario: Tin của tài khoản mới

- **WHEN** người dùng ở mức T0 có một tin trên sàn chung đang hiển thị hạn chế vì tài khoản mới
- **THEN** bảng uy tín liệt kê tin đó kèm lý do "tài khoản mới"

#### Scenario: Lên T1

- **WHEN** người dùng đó lên mức T1 và tin không còn lý do hạn chế nào
- **THEN** tin không còn trong danh sách tin hiển thị hạn chế

### Requirement: Tin đang chờ người duyệt, không lộ dấu hiệu gian lận

Bảng uy tín SHALL liệt kê mọi tin đang chờ người duyệt của người dùng. Tin chờ vì dấu hiệu gian lận — cụm từ
cấm, ảnh trùng, thiết bị, đăng dồn… — SHALL kèm câu chung ba phần: lý do "Tin cần kiểm tra an toàn thêm", thời
gian chờ ước tính, nút liên hệ hỗ trợ kèm mã tra cứu; MUST NOT nêu tín hiệu cụ thể nào, để không dạy cách lách.
Tin chờ vì lý do khác kèm câu "đang chờ người duyệt".

#### Scenario: Tin bị giữ vì cụm từ cấm

- **WHEN** một tin của người dùng bị máy giữ cho người vì trúng cụm từ cấm
- **THEN** bảng uy tín liệt kê tin đó với lý do "Tin cần kiểm tra an toàn thêm", thời gian chờ ước tính và nút
  liên hệ hỗ trợ kèm mã tra cứu, và không nhắc tới cụm từ cấm nào

#### Scenario: Tin bị giữ vì thiết bị

- **WHEN** một tin bị máy giữ cho người vì người đăng là tài khoản thứ 4 đăng tin trên cùng một máy
- **THEN** bảng uy tín liệt kê tin đó với đúng câu chung ba phần ấy và không nhắc tới thiết bị

#### Scenario: Tin đang hiện bị rút về vì cụm từ cấm mới

- **WHEN** một tin đang hiển thị bị máy rút về chờ duyệt vì một cụm từ cấm vừa được bật thật
- **THEN** bảng uy tín liệt kê tin đó với đúng câu chung ba phần ấy và không nhắc tới cụm từ cấm nào

#### Scenario: Hai dấu hiệu khác nhau, cùng một lý do

- **WHEN** một tin bị giữ vì ảnh trùng và một tin khác bị giữ vì đăng dồn
- **THEN** cả hai tin hiện cùng lý do "Tin cần kiểm tra an toàn thêm", không tin nào nêu dấu hiệu của mình

#### Scenario: Tin bị giữ vì danh mục luôn duyệt tay

- **WHEN** một tin bị máy giữ cho người chỉ vì danh mục của nó bật luôn duyệt tay
- **THEN** bảng uy tín liệt kê tin đó với câu "đang chờ người duyệt"

#### Scenario: Không có tin chờ duyệt

- **WHEN** người dùng không có tin nào đang chờ người duyệt mở bảng uy tín
- **THEN** danh sách tin đang chờ người duyệt trống

### Requirement: Thời gian chờ đang áp dụng

Khi người dùng đang trong thời gian chờ vì dò cổng cứng, bảng uy tín SHALL cho biết đang trong thời gian chờ và
thời điểm được gửi tin lại. Bảng uy tín MUST NOT nêu cổng cứng nào đã bị trúng.

#### Scenario: Đang trong thời gian chờ

- **WHEN** người dùng vừa dính cổng cứng lần thứ 3 trong 24 giờ rồi mở bảng uy tín
- **THEN** bảng ghi đang trong thời gian chờ kèm thời điểm được gửi tin lại, không nêu cổng cứng nào

#### Scenario: Hết thời gian chờ

- **WHEN** thời gian chờ của người dùng đã hết
- **THEN** bảng uy tín không còn ghi thời gian chờ

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
