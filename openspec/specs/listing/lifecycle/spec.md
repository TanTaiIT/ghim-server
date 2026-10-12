# listing/lifecycle Specification

## Purpose

Giữ trạng thái của mỗi tin đúng theo sơ đồ vòng đời: tám trạng thái, một tập mũi tên cố định, mỗi mũi tên do
đúng một bên đi — ngoài các mũi tên đó không có cách nào đổi trạng thái (TK 18).

## Requirements

### Requirement: Tám trạng thái của một tin

Mỗi tin SHALL luôn ở đúng một trong tám trạng thái: nháp, đang kiểm, chờ duyệt, đang hiển thị, bị từ chối, đã
bán, hết hạn, bị gỡ. Tin mới tạo ở trạng thái nháp.

#### Scenario: Tin mới tạo

- **WHEN** người dùng tạo một tin
- **THEN** tin ở trạng thái nháp

### Requirement: Mũi tên của người đăng

Người đăng SHALL đi được đúng các mũi tên: gửi (nháp → đang kiểm); rút về (chờ duyệt → nháp); sửa (chờ duyệt →
đang kiểm, đang hiển thị → đang kiểm, bị từ chối hay bị gỡ → đang kiểm khi lý do là sai sót — tin vi phạm xem
review/decisions); gia hạn (hết hạn → đang kiểm); gia hạn sớm (đang hiển thị → đang kiểm, trong 7 ngày cuối —
xem listing/display-period); đánh dấu đã bán (đang hiển thị → đã bán, hết hạn → đã bán).

#### Scenario: Gia hạn sớm tin đang hiển thị

- **WHEN** người đăng gia hạn sớm một tin đang hiển thị còn 5 ngày
- **THEN** tin chuyển sang đang kiểm, đi như khi sửa tin

#### Scenario: Rút tin chờ duyệt về nháp

- **WHEN** người đăng rút về một tin đang chờ duyệt
- **THEN** tin trở về trạng thái nháp

#### Scenario: Đánh dấu đã bán một tin hết hạn

- **WHEN** người đăng đánh dấu đã bán một tin hết hạn
- **THEN** tin chuyển sang đã bán

#### Scenario: Sửa tin bị gỡ vì sai sót

- **WHEN** người đăng sửa một tin bị gỡ với lý do sai sót
- **THEN** tin chuyển sang đang kiểm

#### Scenario: Người khác đi mũi tên của người đăng

- **WHEN** một người dùng khác đánh dấu đã bán một tin đang hiển thị không phải của mình
- **THEN** response có HTTP 403 `FORBIDDEN` và tin vẫn đang hiển thị

### Requirement: Mũi tên của máy duyệt

Chỉ kết quả của máy duyệt SHALL đưa tin rời "đang kiểm": cho qua (đang kiểm → đang hiển thị) hoặc giữ cho người
(đang kiểm → chờ duyệt). Máy còn đi đúng một mũi tên nữa: rút về chờ duyệt (đang hiển thị → chờ duyệt) khi một
cụm từ cấm được bật thật mà tin đang hiện chứa cụm đó. Máy quyết cho qua, giữ hay rút tin nào thuộc phần máy duyệt.
Máy MUST NOT đưa tin sang bị từ chối hay bị gỡ.

#### Scenario: Máy cho qua

- **WHEN** máy duyệt trả kết quả cho qua cho một tin đang kiểm
- **THEN** tin chuyển sang đang hiển thị ở mức hiển thị theo kết quả đó

#### Scenario: Máy giữ cho người

- **WHEN** máy duyệt trả kết quả giữ cho người cho một tin đang kiểm
- **THEN** tin chuyển sang chờ duyệt

#### Scenario: Cụm từ cấm mới bật thật

- **WHEN** một cụm từ cấm được bật thật và máy rút một tin đang hiển thị chứa cụm đó
- **THEN** tin chuyển sang chờ duyệt, không sang bị từ chối, và người lạ không còn thấy tin

### Requirement: Mũi tên của hệ thống

Hệ thống SHALL tự đi đúng một mũi tên: đang hiển thị → hết hạn, khi tin hết ngày hiển thị. Không việc tự động nào
MUST đưa một tin sang đang hiển thị — tin chỉ lên bảng do máy cho qua hoặc do người quyết (TK 26).

#### Scenario: Hết ngày hiển thị

- **WHEN** một tin đang hiển thị dùng hết ngày hiển thị
- **THEN** hệ thống chuyển tin sang hết hạn

#### Scenario: Tin chờ duyệt quá hạn xử

- **WHEN** một tin chờ duyệt đã quá hạn xử của người duyệt mà chưa ai quyết
- **THEN** tin vẫn ở trạng thái chờ duyệt, không tự lên bảng

### Requirement: Mũi tên của người duyệt

Người duyệt SHALL đi được đúng các mũi tên: đạt (chờ duyệt → đang hiển thị), từ chối (chờ duyệt → bị từ chối),
gỡ (đang hiển thị → bị gỡ), khôi phục (bị gỡ → đang hiển thị). Ai là người duyệt của một tin và quyết định thế
nào thuộc phần người duyệt.

#### Scenario: Cho đạt

- **WHEN** người duyệt cho đạt một tin chờ duyệt
- **THEN** tin chuyển sang đang hiển thị

#### Scenario: Từ chối

- **WHEN** người duyệt từ chối một tin chờ duyệt
- **THEN** tin chuyển sang bị từ chối và người lạ không thấy tin

#### Scenario: Gỡ rồi khôi phục

- **WHEN** người duyệt gỡ một tin đang hiển thị rồi sau đó khôi phục nó
- **THEN** tin chuyển sang bị gỡ, rồi trở lại đang hiển thị

#### Scenario: Từ chối một tin đang hiển thị

- **WHEN** người duyệt từ chối một tin đang hiển thị
- **THEN** response có HTTP 409 `INVALID_TRANSITION` và tin vẫn đang hiển thị — với tin đang hiển thị, người
  duyệt chỉ có mũi tên gỡ

### Requirement: Mũi tên khiếu nại thắng

Khiếu nại thắng SHALL đưa tin bị từ chối hoặc bị gỡ sang đang hiển thị; chỉ người xét khiếu nại đi mũi tên này.
Ai xét, hạn xét và hệ quả của khiếu nại nằm ở trust/appeals.

#### Scenario: Tin bị từ chối được khiếu nại thắng

- **WHEN** người xét khiếu nại cho khiếu nại thắng về một tin bị từ chối
- **THEN** tin chuyển sang đang hiển thị

#### Scenario: Tin bị gỡ được khiếu nại thắng

- **WHEN** người xét khiếu nại cho khiếu nại thắng về một tin bị gỡ
- **THEN** tin chuyển sang đang hiển thị

### Requirement: Không có mũi tên nào khác

Ngoài các mũi tên trên, trạng thái tin MUST NOT đổi bằng bất kỳ cách nào. Yêu cầu đi một mũi tên không có SHALL
bị từ chối với HTTP 409 `INVALID_TRANSITION`, và trạng thái giữ nguyên.

#### Scenario: Gia hạn tin đã bán

- **WHEN** người đăng gia hạn một tin đã bán
- **THEN** response có HTTP 409 `INVALID_TRANSITION` và tin vẫn đã bán

#### Scenario: Rút về nháp một tin đang hiển thị

- **WHEN** người đăng rút về nháp một tin đang hiển thị
- **THEN** response có HTTP 409 `INVALID_TRANSITION` và tin vẫn đang hiển thị

#### Scenario: Đánh dấu đã bán một tin chờ duyệt

- **WHEN** người đăng đánh dấu đã bán một tin đang chờ duyệt
- **THEN** response có HTTP 409 `INVALID_TRANSITION` và tin vẫn chờ duyệt

#### Scenario: Sửa nội dung tin đang kiểm

- **WHEN** người đăng sửa tiêu đề của một tin đang kiểm
- **THEN** response có HTTP 409 `INVALID_TRANSITION` và tin vẫn đang kiểm với nội dung cũ

#### Scenario: Sửa tin hết hạn mà không gia hạn

- **WHEN** người đăng sửa giá một tin hết hạn mà không kèm gia hạn
- **THEN** response có HTTP 409 `INVALID_TRANSITION` và tin vẫn hết hạn với giá cũ

#### Scenario: Sửa nội dung tin đã bán

- **WHEN** người đăng sửa giá của một tin đã bán
- **THEN** response có HTTP 409 `INVALID_TRANSITION` và tin không đổi

### Requirement: Tạm ẩn và mức hiển thị không đổi trạng thái

Cờ tạm ẩn và lý do hạn chế SHALL tách khỏi trạng thái tin: đặt hay gỡ chúng MUST NOT đổi trạng thái (TK 27 cam
kết 20).

#### Scenario: Nhóm bị khoá rồi mở khoá

- **WHEN** nhóm chứa một tin đang hiển thị bị tạm khoá rồi được mở khoá
- **THEN** tin vẫn ở trạng thái đang hiển thị suốt thời gian đó, chỉ mang thêm rồi bỏ cờ tạm ẩn

#### Scenario: Gỡ một lý do hạn chế

- **WHEN** một tin đang hiển thị được gỡ lý do hạn chế cuối cùng
- **THEN** tin vẫn ở trạng thái đang hiển thị, chỉ mức hiển thị đổi sang đầy đủ
