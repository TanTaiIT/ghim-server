# category/category-catalog Specification

## Purpose

Cho master quản lý danh mục tin đăng cùng các cài đặt mà máy duyệt và hàng chờ dựa vào — trần giá, giá tham
chiếu, mức rủi ro, luôn duyệt tay, ai duyệt tin nhóm bị giữ — và mẫu thông tin người đăng điền, người mua lọc
theo (TK 11).

## Requirements

### Requirement: Chỉ master tạo danh mục và sửa cài đặt

Chỉ master SHALL tạo danh mục và sửa cài đặt của danh mục: trần giá, giá tham chiếu, mức rủi ro, luôn duyệt tay,
ai duyệt tin nhóm bị giữ. Staff, kể cả staff phụ trách danh mục, MUST NOT sửa được cài đặt.

#### Scenario: Master tạo danh mục

- **WHEN** master tạo danh mục Điện thoại với trần giá 60 triệu đồng và mức rủi ro vừa
- **THEN** response có HTTP 201 và danh mục đang bật với đúng các cài đặt ấy

#### Scenario: Staff phụ trách thử sửa trần giá

- **WHEN** staff phụ trách danh mục Điện thoại sửa trần giá của danh mục
- **THEN** response có HTTP 403 `FORBIDDEN` và trần giá không đổi

#### Scenario: Staff phụ trách thử tắt luôn duyệt tay

- **WHEN** staff phụ trách danh mục Thú cưng tắt luôn duyệt tay của danh mục
- **THEN** response có HTTP 403 `FORBIDDEN` và luôn duyệt tay vẫn bật

#### Scenario: Người dùng thử tạo danh mục

- **WHEN** một người dùng gọi thao tác tạo danh mục
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Cài đặt danh mục phải hợp lệ

Trần giá và giá tham chiếu MUST là số nguyên đồng, không âm. Mức rủi ro MUST là một trong ba: thấp, vừa,
cao. Luôn duyệt tay MUST là bật hoặc tắt. Ai duyệt tin nhóm bị giữ MUST là nhóm hoặc sàn. Có một cài đặt sai thì
SHALL không cài đặt nào được lưu.

#### Scenario: Trần giá âm

- **WHEN** master đặt trần giá của một danh mục là -1 đồng
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và cài đặt không đổi

#### Scenario: Giá có phần lẻ

- **WHEN** master đặt giá tham chiếu là 1500000,5 đồng
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Mức rủi ro không có

- **WHEN** master đặt mức rủi ro "rất cao"
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Người duyệt tin nhóm không có

- **WHEN** master đặt ai duyệt tin nhóm bị giữ của một danh mục là "chủ nhóm"
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và cài đặt không đổi

#### Scenario: Không đặt trần giá

- **WHEN** master tạo danh mục Quần áo mà không đặt trần giá lẫn giá tham chiếu
- **THEN** response có HTTP 201 và danh mục không có trần giá, mức rủi ro thấp, luôn duyệt tay tắt

#### Scenario: Giá tham chiếu vượt trần

- **WHEN** master đặt trần giá 5 triệu và giá tham chiếu 8 triệu cho cùng một danh mục
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và cài đặt không đổi

### Requirement: Mỗi lần đổi cài đặt là một phiên bản cài đặt

Mỗi lần master đổi cài đặt cho máy duyệt của một danh mục SHALL tạo một phiên bản cài đặt mới với số kế tiếp,
người đổi và thời điểm; phiên bản cũ MUST NOT đổi và tra lại được, để kết quả máy ghi lại đúng bộ cài đặt nó
đã dùng (cam kết 33).

#### Scenario: Đổi trần giá hai lần

- **WHEN** master đổi trần giá của Điện thoại từ 60 triệu thành 70 triệu rồi thành 80 triệu
- **THEN** danh mục ở phiên bản cài đặt 3, và tra phiên bản 2 vẫn thấy trần giá 70 triệu

### Requirement: Ba cài đặt về giữ tin tách riêng

Danh mục SHALL có ba cài đặt riêng: mức rủi ro — mức cao chỉ là một dấu hiệu cộng điểm cho máy duyệt, không tự
giữ tin; luôn duyệt tay — bật thì mọi tin của danh mục giữ cho người ở mọi mức tin cậy; ai duyệt tin nhóm bị giữ
— nhóm (điều hành viên) hoặc sàn (staff danh mục), mặc định nhóm; sàn áp cho tin của mọi nhóm, kể cả nhóm riêng
tư. Đổi một cài đặt MUST NOT đổi hai cài đặt kia. Máy duyệt và hàng chờ áp các cài đặt này ở phần của chúng.

#### Scenario: Mức rủi ro cao không bật luôn duyệt tay

- **WHEN** master đổi mức rủi ro của danh mục Điện thoại từ vừa sang cao
- **THEN** danh mục có mức rủi ro cao, còn luôn duyệt tay vẫn tắt và tin nhóm bị giữ vẫn do nhóm duyệt

#### Scenario: Bật luôn duyệt tay

- **WHEN** master bật luôn duyệt tay cho danh mục Thú cưng đang ở mức rủi ro cao
- **THEN** luôn duyệt tay của Thú cưng bật, mức rủi ro vẫn cao

#### Scenario: Mặc định tin nhóm do nhóm duyệt

- **WHEN** master tạo danh mục Quần áo mà không chọn ai duyệt tin nhóm bị giữ
- **THEN** response có HTTP 201 và tin nhóm bị giữ của Quần áo do nhóm duyệt

#### Scenario: Đặt tin nhóm do sàn duyệt

- **WHEN** master đặt tin nhóm bị giữ của danh mục Thú cưng do sàn duyệt
- **THEN** cài đặt được lưu là sàn, còn luôn duyệt tay và mức rủi ro của Thú cưng không đổi

### Requirement: Bật, tắt, không xoá

Chỉ master SHALL bật và tắt được một danh mục. Danh mục MUST NOT bị xoá: thôi dùng thì tắt, và bật lại thì
mọi cài đặt, mẫu thông tin giữ nguyên như lúc tắt.

#### Scenario: Tắt danh mục

- **WHEN** master tắt danh mục Thú cưng
- **THEN** danh sách danh mục đang bật không còn Thú cưng, còn master vẫn thấy nó ở trạng thái tắt

#### Scenario: Bật lại

- **WHEN** master bật lại danh mục Thú cưng
- **THEN** danh mục có lại trong danh sách danh mục đang bật với đúng cài đặt và mẫu thông tin như lúc tắt

#### Scenario: Thử xoá danh mục

- **WHEN** master gửi yêu cầu xoá một danh mục
- **THEN** yêu cầu không được thực hiện vì không có thao tác đó (HTTP 404 `NOT_FOUND`), và danh mục vẫn còn

#### Scenario: Staff thử tắt danh mục

- **WHEN** staff phụ trách danh mục tắt danh mục đó
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Soạn bản nháp mẫu thông tin

Staff phụ trách danh mục và master SHALL soạn được bản nháp mẫu thông tin của danh mục. Mỗi mục MUST có tên —
dùng để lọc, không trùng trong mẫu — và nhãn hiển thị. Bản nháp chưa phát hành không ảnh hưởng gì tới app.

#### Scenario: Staff soạn mẫu

- **WHEN** staff phụ trách Điện thoại soạn bản nháp có mục `hang` nhãn "Hãng" và `dung_luong` nhãn "Dung
  lượng"
- **THEN** bản nháp được lưu và mẫu hiện hành mà app đọc vẫn như trước

#### Scenario: Staff danh mục khác

- **WHEN** staff chỉ phụ trách Xe máy soạn bản nháp mẫu của danh mục Điện thoại
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Hai mục trùng tên

- **WHEN** bản nháp có hai mục cùng tên `hang`
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Mục chọn không có lựa chọn

- **WHEN** bản nháp có mục `hang` kiểu chọn một mà không có lựa chọn nào
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Hai người cùng sửa một bản nháp

- **WHEN** staff Hùng và master cùng mở bản nháp số 3 của Điện thoại và Hùng lưu trước thành bản nháp số 4
- **THEN** lượt lưu của master từ bản nháp số 3 nhận HTTP 409 `CONFLICT` và bản nháp vẫn là của Hùng

#### Scenario: Master bỏ bản nháp

- **WHEN** master bỏ bản nháp của Điện thoại
- **THEN** danh mục không còn bản nháp và mẫu hiện hành không đổi

### Requirement: Chỉ master phát hành mẫu thông tin

Chỉ master SHALL phát hành bản nháp mẫu thông tin. Mỗi lần phát hành MUST tạo một phiên bản mẫu mới của danh
mục, và phiên bản đó thành mẫu hiện hành cho tin đăng mới.

#### Scenario: Master phát hành

- **WHEN** master phát hành bản nháp mẫu của danh mục Điện thoại lần đầu
- **THEN** phiên bản mẫu 1 được tạo và mẫu hiện hành của Điện thoại có mục `hang`, `dung_luong`

#### Scenario: Staff thử phát hành

- **WHEN** staff phụ trách Điện thoại phát hành bản nháp mẫu
- **THEN** response có HTTP 403 `FORBIDDEN` và mẫu hiện hành không đổi

#### Scenario: Bản nháp vừa được lưu bản mới lúc phát hành

- **WHEN** master phát hành bản nháp số 3 của Điện thoại đúng lúc staff vừa lưu bản nháp số 4
- **THEN** response có HTTP 409 `CONFLICT`, không phiên bản mẫu nào được tạo và bản nháp số 4 còn nguyên

### Requirement: Mẫu đã phát hành không đổi

Phiên bản mẫu đã phát hành MUST NOT bị sửa hay xoá; mọi thay đổi đi qua một bản nháp mới và thành phiên bản kế
tiếp. Mọi phiên bản SHALL vẫn đọc được theo số.

#### Scenario: Sửa thẳng phiên bản đã phát hành

- **WHEN** staff gửi thay đổi nhắm vào phiên bản mẫu 1 đã phát hành
- **THEN** response có HTTP 409 `TEMPLATE_PUBLISHED` và phiên bản 1 không đổi

#### Scenario: Đọc phiên bản cũ

- **WHEN** đã có phiên bản mẫu 2 và một người đọc phiên bản 1
- **THEN** response có đúng các mục và nhãn của phiên bản 1

### Requirement: Tên mục không đổi, nhãn đổi được

Một mục đã có trong một phiên bản phát hành SHALL giữ nguyên tên ở mọi bản nháp và phiên bản sau. Nhãn hiển
thị của mục MUST đổi được qua bản nháp mới.

#### Scenario: Đổi nhãn

- **WHEN** bản nháp đổi nhãn của mục `dung_luong` từ "Dung lượng" thành "Bộ nhớ trong" và master phát hành
- **THEN** phiên bản mới có mục `dung_luong` với nhãn "Bộ nhớ trong"

#### Scenario: Đổi tên mục đã phát hành

- **WHEN** bản nháp đổi tên mục `dung_luong` đã phát hành thành `bo_nho`
- **THEN** response có HTTP 409 `TEMPLATE_FIELD_NAME_LOCKED` và mục vẫn mang tên `dung_luong`

#### Scenario: Bỏ một mục ở phiên bản sau

- **WHEN** bản nháp bỏ mục `dung_luong` và master phát hành
- **THEN** phiên bản mới không có mục đó, còn phiên bản cũ đọc lại vẫn có

#### Scenario: Dùng lại tên đã phát hành cho mục kiểu khác

- **WHEN** bản nháp thêm lại mục `dung_luong` với kiểu số trong khi phiên bản đã phát hành từng có `dung_luong`
  kiểu chữ
- **THEN** response có HTTP 409 `TEMPLATE_FIELD_NAME_LOCKED`

### Requirement: Đọc danh mục và mẫu hiện hành

Mọi người, kể cả khách, SHALL đọc được danh sách danh mục đang bật và mẫu thông tin hiện hành của từng danh
mục — tên, nhãn từng mục — để điền khi đăng và lọc khi tìm. Danh mục đang tắt MUST NOT có trong danh sách
này.

#### Scenario: Khách đọc mẫu

- **WHEN** khách đọc mẫu hiện hành của danh mục Điện thoại
- **THEN** response có HTTP 200 với các mục `hang`, `dung_luong` cùng nhãn của từng mục

#### Scenario: Danh mục không tồn tại

- **WHEN** khách đọc mẫu của một mã danh mục không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

### Requirement: Cài đặt cho máy duyệt không công khai

Danh sách danh mục và mẫu mà khách đọc MUST NOT chứa trần giá, giá tham chiếu, mức rủi ro, luôn duyệt tay hay
ai duyệt tin nhóm bị giữ; các cài đặt này SHALL chỉ hiện ở bàn vận hành (nguyên tắc 8: không dạy cách lách).

#### Scenario: Khách đọc danh sách danh mục

- **WHEN** khách đọc danh sách danh mục đang bật
- **THEN** mỗi danh mục chỉ có mã, tên và số phiên bản mẫu hiện hành — không có trần giá, giá tham chiếu hay mức
  rủi ro

#### Scenario: Master xem danh mục

- **WHEN** master xem danh sách danh mục ở bàn vận hành
- **THEN** response có HTTP 200 với đủ cài đặt của từng danh mục, kể cả danh mục đang tắt

### Requirement: Danh mục và mẫu cho phép giữ lại có hạn

Danh sách danh mục đang bật và mẫu thông tin hiện hành SHALL cho phép app và máy chủ trung gian giữ lại tối đa
5 phút: master tắt một danh mục hay phát hành một mẫu thì app thấy chậm nhiều nhất 5 phút. Một phiên bản mẫu đã
phát hành SHALL cho phép giữ lại mãi, vì nó không bao giờ đổi. Danh sách danh mục công khai MUST chỉ dựa trên
mã, tên và số phiên bản mẫu hiện hành.

#### Scenario: Danh sách danh mục

- **WHEN** khách đọc danh sách danh mục đang bật
- **THEN** response có HTTP 200 và cho phép giữ lại tối đa 5 phút

#### Scenario: Mẫu hiện hành

- **WHEN** khách đọc mẫu hiện hành của danh mục Điện thoại
- **THEN** response có HTTP 200 và cho phép giữ lại tối đa 5 phút

#### Scenario: Phiên bản mẫu đã phát hành

- **WHEN** khách đọc phiên bản mẫu 1 của danh mục Điện thoại
- **THEN** response có HTTP 200 và cho phép giữ lại mãi

#### Scenario: Danh mục ở bàn vận hành

- **WHEN** master xem danh sách danh mục ở bàn vận hành
- **THEN** response có HTTP 200 và cấm giữ lại
