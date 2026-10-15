# review/decisions Specification

## Purpose

Định nghĩa những kết quả một người duyệt được ra, hệ quả của từng kết quả lên tin, và dấu vết mỗi quyết định
để lại, để không ai quyết dựa trên nội dung cũ hay quyết mà không để lại nhật ký (TK 17, TK 18).

## Requirements

### Requirement: Đạt cho tin máy giữ

Kết quả "đạt" cho một việc máy giữ SHALL đưa tin lên bảng; tin hiển thị đầy đủ, trừ khi người đăng hay nơi
đăng còn một lý do hạn chế độc lập với lần giữ này, như "tài khoản mới". Quyết định SHALL ghi kèm nhận định
"máy đúng" hay "máy quá tay".

#### Scenario: Tin của T2 bị giữ vì giá vượt trần

- **WHEN** staff cho đạt việc hàng 0 về tin sàn của tài khoản T2 bị giữ vì giá vượt trần danh mục
- **THEN** tin chuyển sang đang hiển thị ở mức đầy đủ

#### Scenario: Tin sàn của tài khoản T0

- **WHEN** staff cho đạt việc hàng 0 về tin sàn của tài khoản T0
- **THEN** tin chuyển sang đang hiển thị ở mức hạn chế với lý do "tài khoản mới"

#### Scenario: Tin dải Vừa bị giữ vì cổng cứng

- **WHEN** staff cho đạt việc hàng 0 về tin sàn của tài khoản T1, điểm rủi ro dải Vừa, bị giữ vì ảnh trùng
- **THEN** tin hiển thị đầy đủ, không mang lý do hạn chế "máy" và không có việc hàng 3 nào về tin đó (chốt
  15/10/2026)

#### Scenario: Nhận định về máy

- **WHEN** staff cho đạt một việc máy giữ
- **THEN** nhật ký quyết định ghi nhận định "máy đúng" hoặc "máy quá tay" cùng các luật máy đã trúng

#### Scenario: Thiếu nhận định về máy

- **WHEN** staff cho đạt một việc máy giữ mà không chọn "máy đúng" hay "máy quá tay"
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và tin không đổi

### Requirement: Đạt cho tin đang hậu kiểm

Kết quả "đạt" cho việc hàng 3 hay hàng 5 SHALL giữ tin như đang hiện và gỡ lý do hạn chế "máy" nếu tin có;
các lý do hạn chế khác MUST giữ nguyên.

#### Scenario: Tin hạn chế do máy được cho đạt

- **WHEN** staff cho đạt việc hàng 3 về tin của T1 đang hạn chế chỉ vì lý do "máy"
- **THEN** tin hiển thị đầy đủ và số ngày hiển thị còn lại không đổi

#### Scenario: Mẫu hậu kiểm được cho đạt

- **WHEN** người hậu kiểm cho đạt việc hàng 5 về một tin đang hiển thị đầy đủ
- **THEN** việc đóng và tin giữ nguyên trạng thái, mức hiển thị, số ngày còn lại

### Requirement: Từ chối hoặc gỡ vì sai sót

Kết quả "từ chối / gỡ — sai sót" SHALL kèm một lý do mẫu: tin đang chờ duyệt chuyển sang bị từ chối, tin
đang hiện chuyển sang bị gỡ, và người đăng thấy lý do mẫu đó. Kết quả này MUST NOT đổi gì trên tài khoản
người đăng: mức tin cậy, hạn mức, gậy.

#### Scenario: Từ chối tin máy giữ

- **WHEN** staff từ chối vì sai sót một tin đang chờ duyệt, kèm lý do mẫu "Ảnh chưa rõ sản phẩm"
- **THEN** tin chuyển sang bị từ chối và người đăng thấy lý do "Ảnh chưa rõ sản phẩm"

#### Scenario: Gỡ tin đang hậu kiểm

- **WHEN** người hậu kiểm gỡ vì sai sót một tin đang hiện có việc hàng 5
- **THEN** tin chuyển sang bị gỡ và không còn hiện với người khác

#### Scenario: Thiếu lý do mẫu

- **WHEN** staff từ chối vì sai sót mà không kèm lý do mẫu
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và tin không đổi

#### Scenario: Tài khoản người đăng không bị ảnh hưởng

- **WHEN** tin của một người dùng T2 bị từ chối vì sai sót
- **THEN** người đó vẫn ở T2, hạn mức như trước và không có gậy nào

### Requirement: Gỡ khỏi nhóm

Kết quả "gỡ khỏi nhóm" SHALL chỉ áp cho tin trong nhóm, và chỉ điều hành viên, chủ nhóm của nhóm đó hoặc master
ra được. Tin rời khỏi nhóm và không còn hiện trong nhóm.

#### Scenario: Điều hành viên gỡ tin khỏi nhóm

- **WHEN** điều hành viên gỡ khỏi nhóm một tin trong nhóm mà mình đang nhận việc
- **THEN** tin không còn thuộc nhóm và không hiện trong bảng tin của nhóm

#### Scenario: Gỡ khỏi nhóm một tin sàn

- **WHEN** người xử chọn "gỡ khỏi nhóm" cho việc về một tin sàn
- **THEN** response có HTTP 409 `OUTCOME_NOT_ALLOWED` và tin không đổi

#### Scenario: Staff chọn gỡ khỏi nhóm

- **WHEN** staff đang nhận việc về một tin trong nhóm chọn "gỡ khỏi nhóm"
- **THEN** response có HTTP 403 `FORBIDDEN` và tin không đổi

### Requirement: Lý do mẫu do master soạn

Master SHALL thêm, sửa câu và tắt được lý do mẫu cho kết quả "sai sót", dùng chung cho mọi danh mục; khởi đầu có sáu
lý do: Ảnh chưa rõ sản phẩm · Thiếu thông tin quan trọng · Sai danh mục · Giá ghi sai · Tiêu đề không mô tả món hàng ·
Trùng tin đã đăng. Lý do đã tắt MUST NOT dùng được cho quyết định mới (chốt 15/10/2026).

#### Scenario: Master thêm lý do mẫu

- **WHEN** master thêm lý do mẫu "Ảnh chụp màn hình, không phải ảnh thật"
- **THEN** staff thấy lý do đó khi từ chối vì sai sót

#### Scenario: Staff soạn lý do mẫu

- **WHEN** staff thêm một lý do mẫu
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Dùng lý do đã tắt

- **WHEN** staff từ chối vì sai sót kèm một lý do mẫu master đã tắt
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và tin không đổi

### Requirement: Gỡ trực tiếp tin sàn đang hiện

Staff được giao danh mục của tin và master SHALL gỡ được trực tiếp một tin sàn đang hiện mà không có việc mở, với
mức "sai sót" kèm lý do mẫu (TK 6). Quyết định vào nhật ký như mọi quyết định, không gắn việc nào. Tin đang có việc mở
thì MUST xử qua việc đó (chốt 15/10/2026).

#### Scenario: Staff gỡ thẳng tin sàn

- **WHEN** staff được giao Điện thoại gỡ vì sai sót một tin sàn Điện thoại đang hiện, kèm lý do mẫu "Sai danh mục"
- **THEN** tin chuyển sang bị gỡ, người đăng thấy lý do đó, và nhật ký có một dòng quyết định không gắn việc

#### Scenario: Tin đang có việc mở

- **WHEN** staff gỡ thẳng một tin đang có việc hàng 3
- **THEN** response có HTTP 409 `TASK_OPEN` và tin không đổi

#### Scenario: Gỡ thẳng tin trong nhóm

- **WHEN** staff gỡ thẳng một tin chỉ đăng trong nhóm, không ở sàn chung
- **THEN** response có HTTP 409 `OUTCOME_NOT_ALLOWED` và tin không đổi

### Requirement: Khôi phục tin sàn đã bị gỡ

Staff được giao danh mục của tin và master SHALL khôi phục được một tin sàn đang bị gỡ, bằng thao tác trực tiếp
trên tin, không qua việc: tin trở lại hiển thị và ngày hiển thị chạy tiếp từ chỗ đã dừng lúc bị gỡ. Tin đã gỡ khỏi
nhóm không có khôi phục vào nhóm (chốt 15/10/2026).

#### Scenario: Khôi phục tin bị gỡ

- **WHEN** tin bị gỡ lúc còn 12 ngày hiển thị, 5 ngày sau staff được giao danh mục của tin khôi phục nó
- **THEN** tin hiển thị lại với 12 ngày còn lại

#### Scenario: Khôi phục tin không bị gỡ

- **WHEN** staff khôi phục một tin đang hiển thị
- **THEN** response có HTTP 409 `INVALID_TRANSITION` và tin vẫn đang hiển thị

#### Scenario: Staff khác danh mục khôi phục

- **WHEN** staff chỉ được giao Xe máy khôi phục một tin Điện thoại đang bị gỡ
- **THEN** response có HTTP 403 `FORBIDDEN` và tin vẫn bị gỡ

### Requirement: Quyết định chỉ áp lên nội dung người xử đã thấy

Quyết định SHALL được ghi có điều kiện theo phiên bản tin lúc người xử nhận việc. Người đăng đã sửa tin sau
lúc đó thì quyết định MUST bị từ chối, không có gì thay đổi, và người xử phải tải lại tin.

#### Scenario: Người đăng sửa trong lúc duyệt

- **WHEN** staff đang nhận việc và người đăng sửa tiêu đề tin trước khi staff quyết
- **THEN** quyết định của staff nhận HTTP 409 `LISTING_CHANGED` và tin không đổi theo quyết định đó

#### Scenario: Tải lại rồi quyết

- **WHEN** bản sửa vẫn bị máy giữ, staff tải lại và nhận lại việc
- **THEN** staff thấy nội dung mới và quyết được trên nội dung đó

### Requirement: Người quyết phải còn quyền lúc quyết

Quyền xử việc SHALL được kiểm lại tại lúc quyết, không chỉ lúc nhận: người đã mất quyền xử một việc trong lúc
đang nhận nó MUST NOT quyết được việc đó.

#### Scenario: Điều hành viên bị bãi nhiệm khi đang nhận việc

- **WHEN** điều hành viên đang nhận một việc về tin trong nhóm thì bị chủ nhóm bãi nhiệm, rồi quyết
- **THEN** response có HTTP 403 `FORBIDDEN` và không có gì thay đổi

### Requirement: Nhật ký quyết định

Mỗi quyết định SHALL được ghi vào nhật ký: ai quyết, về tin nào, qua việc nào nếu có, kết quả, mức độ, lý do,
kết quả máy trước đó, và hậu quả thật — trạng thái tin sau quyết định và mức tin cậy của người đăng sau đó.
Nhật ký MUST NOT chứa nội dung tin.

#### Scenario: Ghi một quyết định từ chối

- **WHEN** staff từ chối vì sai sót một tin máy giữ
- **THEN** nhật ký có một dòng nêu staff đó, mã tin, mã việc, kết quả "từ chối", mức độ "sai sót", lý do
  mẫu, kết quả máy "giữ", trạng thái tin "bị từ chối" và mức tin cậy của người đăng

#### Scenario: Nhật ký không chứa nội dung tin

- **WHEN** một quyết định được ghi vào nhật ký
- **THEN** dòng nhật ký không chứa tiêu đề, mô tả hay ảnh của tin

#### Scenario: Quyết định của master

- **WHEN** master quyết một việc
- **THEN** quyết định đó có dòng nhật ký như quyết định của mọi người khác
