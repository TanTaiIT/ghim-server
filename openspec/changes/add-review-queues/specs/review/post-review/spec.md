## Purpose

Cho người xem lại một phần tin đã lên bảng — do máy hay do người cho lên — để biết máy và người duyệt đang để
lọt gì (TK 16, cam kết 27).

## ADDED Requirements

### Requirement: Lấy mẫu hậu kiểm theo rủi ro

Mỗi giờ hệ thống SHALL xét các tin vừa lên bảng và đưa vào hàng 5 (giá trị khởi đầu): mọi tin có điểm rủi ro
từ 45 tới 59; 20% tin của tài khoản T0 và T1; 5% tin còn lại. Tin đang có việc mở MUST NOT bị lấy mẫu.

#### Scenario: Tin điểm 50

- **WHEN** tin của tài khoản T2 có điểm rủi ro 50 lên bảng ở mức đầy đủ
- **THEN** tin vào hàng 5 ở lượt lấy mẫu kế tiếp

#### Scenario: Tin của T1 điểm thấp

- **WHEN** tin của tài khoản T1 có điểm rủi ro 10 lên bảng
- **THEN** tin vào hàng 5 với xác suất 20%

#### Scenario: Tin của T3 điểm thấp

- **WHEN** tin của tài khoản T3 có điểm rủi ro 0 lên bảng
- **THEN** tin vào hàng 5 với xác suất 5%

#### Scenario: Tin đang có việc mở

- **WHEN** tin của T1 ở dải Vừa lên bảng hạn chế và đang có việc hàng 3
- **THEN** tin không bị lấy mẫu

#### Scenario: Tin do người cho lên

- **WHEN** một tin máy giữ được người duyệt cho đạt và lên bảng
- **THEN** tin được xét lấy mẫu theo rủi ro như tin máy cho lên

### Requirement: Hậu kiểm quyết định của người duyệt

Mỗi tin được một người duyệt cho "đạt" SHALL có 5% (giá trị khởi đầu) khả năng vào hàng 5 để người khác xem
lại. Hệ thống SHALL tính cho từng người duyệt tỉ lệ bị lật — phần quyết định "đạt" đã hậu kiểm mà người hậu
kiểm gỡ tin — và master xem được tỉ lệ đó.

#### Scenario: Lấy mẫu quyết định đạt

- **WHEN** staff A cho đạt một tin máy giữ
- **THEN** tin đó vào hàng 5 với xác suất 5%, ngoài khả năng bị lấy mẫu theo rủi ro

#### Scenario: Tỉ lệ bị lật

- **WHEN** 20 quyết định "đạt" của staff A đã được hậu kiểm và người hậu kiểm gỡ 2 tin trong số đó
- **THEN** master thấy tỉ lệ bị lật của A là 10%

### Requirement: Mẫu hậu kiểm quá hạn thì tự huỷ

Việc hàng 5 chỉ mang lý do mẫu hậu kiểm mà quá hạn xử SHALL tự huỷ và được đếm vào số liệu "bỏ sót"; tin MUST
giữ nguyên như đang hiện. Đây là hàng duy nhất có việc tự huỷ khi quá hạn.

#### Scenario: Mẫu không ai xử trong 7 ngày

- **WHEN** việc hàng 5 về một tin đang hiển thị quá 7 ngày chưa ai quyết
- **THEN** việc bị huỷ, số "bỏ sót" tăng 1, và tin vẫn hiển thị như cũ

#### Scenario: Đang nhận lúc việc bị huỷ

- **WHEN** staff đang nhận việc hàng 5 lúc việc tự huỷ, rồi quyết
- **THEN** response có HTTP 409 `TASK_CLOSED`

### Requirement: Báo master khi hậu kiểm làm không xuể

Mỗi tuần, nếu số việc hàng 5 được xử xong dưới 80% (giá trị khởi đầu) số việc hàng 5 của tuần đó, master
SHALL nhận một cảnh báo.

#### Scenario: Làm xong dưới 80%

- **WHEN** trong một tuần có 100 việc hàng 5, 75 việc được xử xong và 25 việc tự huỷ
- **THEN** master nhận cảnh báo hậu kiểm làm xong 75%

#### Scenario: Làm xong từ 80% trở lên

- **WHEN** trong một tuần có 100 việc hàng 5 và 85 việc được xử xong
- **THEN** master không nhận cảnh báo hậu kiểm
