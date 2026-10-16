# screening/rule-management Specification

## Purpose

Cho master chỉnh luật của máy duyệt — trọng số, chế độ bật · chạy thử · tắt, giá trị riêng theo danh mục — mà
không cần phát hành lại phần mềm, và luôn biết một kết quả máy dựa trên phiên bản luật nào (TK 13, cam kết
33).

## Requirements

### Requirement: Master chỉnh trọng số và chế độ của luật

Mỗi luật của máy SHALL có mã ổn định, trọng số và một chế độ: bật, chạy thử hoặc tắt. Chỉ master SHALL đổi
được trọng số và chế độ; thay đổi có hiệu lực từ lượt qua máy kế tiếp, không cần phát hành lại phần mềm.

#### Scenario: Master hạ trọng số

- **WHEN** master đổi trọng số của luật "liên hệ ngoài sàn" từ 20 xuống 10, rồi một tin chỉ trúng luật này
  được gửi
- **THEN** tin đó có điểm 10

#### Scenario: Staff đổi trọng số

- **WHEN** một staff đổi trọng số của một luật
- **THEN** response có HTTP 403 `FORBIDDEN` và luật không đổi

#### Scenario: Luật không tồn tại

- **WHEN** master đổi trọng số của một mã luật không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Thiếu trọng số

- **WHEN** master gửi yêu cầu đổi trọng số mà bỏ trống trọng số
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và luật không đổi

### Requirement: Luật chạy thử và luật tắt không đổi kết quả

Luật ở chế độ chạy thử SHALL vẫn được chấm và ghi vào kết quả máy, nhưng MUST NOT cộng vào điểm hay đổi kết
quả. Luật ở chế độ tắt MUST NOT được chấm.

#### Scenario: Luật đang chạy thử

- **WHEN** luật "bị giữ nhiều" đang chạy thử và tin của tài khoản T1 có điểm 20 từ các luật khác cộng thêm
  một lượt trúng "bị giữ nhiều"
- **THEN** điểm là 20, kết quả máy là hiện đầy đủ, và kết quả ghi lại lượt trúng "bị giữ nhiều" ở chế độ
  chạy thử

#### Scenario: Luật bị tắt

- **WHEN** master tắt luật "tài khoản mới" rồi một tài khoản 1 ngày tuổi gửi tin
- **THEN** tin không trúng "tài khoản mới" và kết quả máy không ghi luật này

### Requirement: Luật mới chạy thử trước

Luật mới đưa vào máy duyệt SHALL bắt đầu ở chế độ chạy thử và chỉ có tác dụng khi master bật.

#### Scenario: Luật vừa được đưa vào

- **WHEN** một luật mới được đưa vào máy duyệt
- **THEN** luật ở chế độ chạy thử và không đổi điểm của tin nào cho tới khi master bật

### Requirement: Chỉnh luật riêng theo danh mục

Master SHALL đặt được trọng số hoặc chế độ riêng của một luật cho một danh mục. Tin thuộc danh mục đó SHALL
dùng giá trị riêng; tin thuộc danh mục khác dùng giá trị chung.

#### Scenario: Trọng số riêng cho một danh mục

- **WHEN** master đặt trọng số luật "liên hệ ngoài sàn" là 30 riêng cho danh mục Điện thoại, giá trị chung vẫn
  là 20
- **THEN** tin Điện thoại chỉ trúng luật này có điểm 30, còn tin Quần áo chỉ trúng luật này có điểm 20

#### Scenario: Tắt luật riêng cho một danh mục

- **WHEN** master tắt luật "giá bất thường" riêng cho danh mục Đồ cổ
- **THEN** tin Đồ cổ không trúng "giá bất thường", còn tin danh mục khác vẫn được xét luật này

### Requirement: Mỗi lần đổi luật là một phiên bản mới

Mỗi lần master đổi trọng số, chế độ hay giá trị riêng theo danh mục của một luật SHALL tạo một phiên bản luật
mới; lượt qua máy sau đó SHALL ghi phiên bản mới này trong kết quả.

#### Scenario: Đổi trọng số tạo phiên bản mới

- **WHEN** master đổi trọng số một luật rồi một tin được gửi
- **THEN** kết quả máy của tin đó mang phiên bản luật mới, khác phiên bản của các kết quả trước lần đổi

### Requirement: Cổng cứng chạy thử được, không tắt được

Mỗi cổng cứng SHALL có chế độ bật hoặc chạy thử. Cổng chạy thử được kiểm và ghi vào kết quả máy nhưng MUST NOT giữ
tin hay đếm vào lượt dò. Cổng cứng MUST NOT tắt được (chốt 12/10/2026).

#### Scenario: Master tắt một cổng cứng

- **WHEN** master đổi chế độ của cổng "giá vượt trần" sang tắt
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và cổng giữ chế độ cũ

#### Scenario: Cổng ảnh trùng đang chạy thử

- **WHEN** cổng "ảnh trùng" đang chạy thử và tài khoản T2 gửi tin dùng lại ảnh của tài khoản khác, không trúng gì khác
- **THEN** kết quả máy là hiện đầy đủ, và kết quả ghi lượt trúng cổng "ảnh trùng" ở chế độ chạy thử

### Requirement: Đo tỉ lệ máy quá tay theo từng luật

Hệ thống SHALL đo, theo từng luật của máy, tỉ lệ tin máy giữ có trúng luật đó mà người duyệt cho đạt, trên
số tin máy giữ có trúng luật đó đã có quyết định của người. Master SHALL xem được tỉ lệ này cùng số lượt "máy
quá tay" người duyệt đã ghi, để hạ trọng số luật quá tay (TK 13, TK 17).

#### Scenario: Tỉ lệ của một luật

- **WHEN** luật "liên hệ ngoài sàn" đã trúng ở 10 tin máy giữ có quyết định của người, và 7 tin trong số đó
  được cho đạt
- **THEN** master thấy tỉ lệ tin máy giữ mà người cho qua của luật này là 70%

#### Scenario: Việc chưa có quyết định không được tính

- **WHEN** một tin máy giữ có trúng luật "liên hệ ngoài sàn" còn đang chờ duyệt, hoặc việc về nó tự huỷ vì
  máy cho bản sửa qua
- **THEN** tin đó không được tính vào tỉ lệ của luật này
