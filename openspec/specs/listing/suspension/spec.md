# listing/suspension Specification

## Purpose

Giấu tạm một tin vì lý do nằm ngoài chính tin đó — tài khoản, nhóm, danh mục — mà không phạt người đăng, và trả
tin về đúng như cũ khi hết lý do (TK 3, TK 4 nguyên tắc 9, TK 7, TK 9, TK 10, TK 11, TK 19).

## Requirements

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

Khi người đăng rời một nhóm, tin "chỉ thành viên" của người đó trong nhóm SHALL tạm ẩn: tự rời thì với lý do "đã
rời nhóm", bị gỡ hay bị cấm thì với lý do "bị gỡ khỏi nhóm". Vào lại nhóm thì lý do này được gỡ (TK 10, chốt
12/10/2026).

#### Scenario: Tự rời nhóm

- **WHEN** người đăng có một tin "chỉ thành viên" trong nhóm X và một tin sàn chung tự rời nhóm X
- **THEN** tin "chỉ thành viên" tạm ẩn, còn tin sàn chung vẫn hiện như cũ

#### Scenario: Vào lại nhóm

- **WHEN** người đó vào lại nhóm X
- **THEN** tin "chỉ thành viên" hiện lại

#### Scenario: Bị gỡ khỏi nhóm

- **WHEN** điều hành viên gỡ khỏi nhóm X một thành viên có tin "chỉ thành viên" trong nhóm X
- **THEN** tin đó tạm ẩn với lý do "bị gỡ khỏi nhóm", không phải "đã rời nhóm"

### Requirement: Tin "nhóm công khai" của người rời nhóm theo công tắc nhận tin người ngoài

Khi người đăng rời nhóm, tin "nhóm công khai" của người đó trong nhóm SHALL tạm ẩn với cùng lý do rời nhóm nếu
đúng lúc rời, nhóm đang tắt nhận tin người ngoài; nhóm đang bật thì tin giữ nguyên và thành tin người ngoài. Chủ
nhóm bật nhận tin người ngoài sau đó MUST NOT làm tin đã ẩn tự hiện lại (TK 10, chốt 12/10/2026).

#### Scenario: Rời nhóm đang tắt nhận tin người ngoài

- **WHEN** thành viên có một tin "nhóm công khai" trong nhóm công khai X, nhóm đang tắt nhận tin người ngoài, tự
  rời nhóm X
- **THEN** tin "nhóm công khai" đó tạm ẩn với lý do "đã rời nhóm", và khách mở tin nhận HTTP 404 `NOT_FOUND`

#### Scenario: Rời nhóm đang bật nhận tin người ngoài

- **WHEN** thành viên có một tin "nhóm công khai" trong nhóm công khai X, nhóm đang bật nhận tin người ngoài, bị
  gỡ khỏi nhóm X
- **THEN** tin "nhóm công khai" đó vẫn hiện trong nhóm X như tin người ngoài, còn tin "chỉ thành viên" của người
  đó tạm ẩn

#### Scenario: Bật nhận tin người ngoài sau khi đã rời

- **WHEN** người đăng đã rời nhóm X lúc nhóm tắt nhận tin người ngoài, rồi chủ nhóm bật nhận tin người ngoài
- **THEN** tin "nhóm công khai" của người đó vẫn tạm ẩn với lý do "đã rời nhóm" cho tới khi người đó vào lại nhóm

### Requirement: Người đăng bị cấm khỏi nhóm

Khi một người bị cấm khỏi nhóm, mọi tin của người đó trong nhóm, ở mọi mức, SHALL tạm ẩn với lý do "bị cấm khỏi
nhóm" — kể cả người ngoài chưa từng vào nhóm. Gỡ cấm SHALL chỉ gỡ lý do này; tin còn lý do khác MUST vẫn tạm ẩn
(TK 10, chốt 12/10/2026).

#### Scenario: Cấm một thành viên

- **WHEN** điều hành viên cấm khỏi nhóm X một thành viên có tin "chỉ thành viên", tin "nhóm công khai" trong nhóm
  X và một tin sàn chung, nhóm đang bật nhận tin người ngoài
- **THEN** cả hai tin trong nhóm X tạm ẩn với lý do "bị cấm khỏi nhóm", tin "chỉ thành viên" mang thêm lý do "bị
  gỡ khỏi nhóm", còn tin sàn chung vẫn hiện như cũ

#### Scenario: Cấm một người ngoài

- **WHEN** điều hành viên cấm khỏi nhóm X một người chưa từng vào nhóm, có một tin người ngoài đang hiển thị
  trong nhóm X
- **THEN** tin đó tạm ẩn với lý do "bị cấm khỏi nhóm", và khách mở tin nhận HTTP 404 `NOT_FOUND`

#### Scenario: Gỡ cấm người ngoài

- **WHEN** điều hành viên gỡ cấm người ngoài đó
- **THEN** tin người ngoài của người đó hiện lại trong nhóm X đúng như trước khi bị cấm

#### Scenario: Gỡ cấm cựu thành viên

- **WHEN** điều hành viên gỡ cấm người đã bị cấm trong scenario "Cấm một thành viên"
- **THEN** tin "nhóm công khai" hiện lại như tin người ngoài, còn tin "chỉ thành viên" vẫn tạm ẩn với lý do "bị
  gỡ khỏi nhóm" cho tới khi người đó vào lại nhóm

#### Scenario: Người bị cấm xem tin của mình

- **WHEN** người bị cấm mở danh sách tin của mình
- **THEN** người đó thấy các tin trong nhóm X cùng lý do "bị cấm khỏi nhóm"

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

### Requirement: Tin bị gỡ khỏi nhóm

Khi một tin bị gỡ khỏi nhóm theo quyết định của điều hành viên (review/decisions), tin SHALL rời nhóm ngay với lý
do "tin bị gỡ khỏi nhóm" và MUST NOT hiện lại trong nhóm đó. Đây không phải vi phạm: trạng thái tin không đổi
sang "bị gỡ" (TK 17, chốt 12/10/2026).

#### Scenario: Điều hành viên gỡ tin khỏi nhóm

- **WHEN** một tin "chỉ thành viên" đang hiển thị bị gỡ khỏi nhóm
- **THEN** thành viên mở tin nhận HTTP 404 `NOT_FOUND`, còn người đăng thấy tin vẫn ở trạng thái đang hiển thị
  cùng lý do "tin bị gỡ khỏi nhóm"

### Requirement: Chuyển tin đã rời nhóm lên sàn chung

Tin rời nhóm vì nhóm đóng, vì bị gỡ khỏi nhóm, hay tin người ngoài rời nhóm vì nhóm sang riêng tư SHALL được
người đăng chuyển lên sàn chung trong 30 ngày (giá trị khởi đầu) kể từ lúc rời nhóm. Chuyển là tạo một tin mới ở
sàn chung, mỗi tin chuyển một lần; quá hạn MUST bị từ chối (TK 9, TK 10, TK 25, chốt 12/10/2026).

#### Scenario: Chuyển trong hạn

- **WHEN** 10 ngày sau khi nhóm đóng, người đăng chuyển tin của mình trong nhóm đó lên sàn chung, có đủ tỉnh
  và phường
- **THEN** một tin mới ở sàn chung chuyển sang đang kiểm, mang bản sao nội dung và ảnh của tin cũ, còn tin cũ
  vẫn không hiện trong nhóm

#### Scenario: Tin mới có ngày hiển thị và vị trí mới

- **WHEN** tin mới chuyển từ nhóm lên được máy cho qua
- **THEN** tin có đủ 30 ngày hiển thị tính từ lúc lên bảng và đứng ở vị trí của một tin vừa đăng

#### Scenario: Chuyển tin bị gỡ khỏi nhóm

- **WHEN** 5 ngày sau khi tin bị gỡ khỏi nhóm, người đăng chuyển tin đó lên sàn chung, có đủ tỉnh và phường
- **THEN** một tin mới ở sàn chung chuyển sang đang kiểm

#### Scenario: Chuyển khi thiếu khu vực

- **WHEN** người đăng chuyển lên sàn chung một tin đã rời nhóm chưa có phường
- **THEN** response có HTTP 400 `REGION_REQUIRED`, không tin mới nào được tạo và tin cũ không đổi

#### Scenario: Chuyển lần thứ hai

- **WHEN** người đăng chuyển lên sàn chung một tin đã rời nhóm mà tin đó đã được chuyển trước đây
- **THEN** response có HTTP 409 `ALREADY_MOVED` và không tin mới nào được tạo

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

### Requirement: Tắt nhận tin người ngoài không gỡ tin đã gửi

Khi chủ nhóm tắt "nhận tin người ngoài" mà không đổi chế độ, tin người ngoài đã gửi vào nhóm SHALL giữ nguyên — tin
đang hiển thị vẫn hiện, tin đang chờ máy hay người vẫn được xét như thường. Từ lúc tắt, nhóm MUST NOT nhận tin
người ngoài mới, kể cả tin được chuyển vào nhóm (TK 9, chốt 12/10/2026).

#### Scenario: Tin người ngoài đang hiển thị

- **WHEN** chủ nhóm tắt nhận tin người ngoài ở một nhóm công khai có tin người ngoài đang hiển thị
- **THEN** tin đó vẫn hiện trong nhóm như trước, không có lý do tạm ẩn nào

#### Scenario: Tin người ngoài đang chờ duyệt

- **WHEN** chủ nhóm tắt nhận tin người ngoài lúc một tin người ngoài của nhóm đang chờ duyệt, rồi người duyệt cho
  đạt
- **THEN** tin lên bảng tin của nhóm như mọi tin được duyệt

#### Scenario: Người ngoài gửi tin mới sau khi tắt

- **WHEN** người ngoài đang có tin hiển thị trong nhóm gửi thêm một tin mới vào nhóm đó sau khi nhóm tắt nhận tin
  người ngoài
- **THEN** response có HTTP 403 `OUTSIDER_POSTS_DISABLED` và nháp vẫn là nháp

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

#### Scenario: Rút về nháp rồi gửi sang danh mục đang bật

- **WHEN** người đăng rút về nháp một tin chờ duyệt đang tạm ẩn vì danh mục bị tắt, đổi sang một danh mục đang bật rồi gửi
- **THEN** lý do "danh mục bị tắt" được gỡ và tin chuyển sang đang kiểm

### Requirement: Đổi nơi đăng ra khỏi nhóm thì lý do của nhóm rơi theo

Tin đang tạm ẩn vì một nhóm — người đăng tự rời, bị gỡ hay bị cấm khỏi nhóm, nhóm bị tạm khoá — mà người đăng đổi
nơi đăng ra khỏi nhóm đó SHALL mất mọi lý do tạm ẩn của nhóm ấy; tin qua máy như mọi lần đổi nơi đăng, và lý do
không thuộc nhóm (tài khoản, danh mục) vẫn giữ (chốt 12/10/2026).

#### Scenario: Người bị cấm đưa tin lên sàn chung

- **WHEN** người bị cấm khỏi nhóm X đổi tin "nhóm công khai" đang tạm ẩn vì bị cấm của mình lên sàn chung, có đủ
  tỉnh và phường
- **THEN** lý do "bị cấm khỏi nhóm" được gỡ và tin chuyển sang đang kiểm ở sàn chung

#### Scenario: Còn lý do của danh mục

- **WHEN** người đăng đổi lên sàn chung một tin "chỉ thành viên" đang tạm ẩn vì đã rời nhóm X và vì danh mục bị tắt
- **THEN** lý do "đã rời nhóm" được gỡ, còn lý do "danh mục bị tắt" vẫn giữ

#### Scenario: Rút về nháp rồi đưa lên sàn chung

- **WHEN** tin chờ duyệt trong nhóm X tạm ẩn vì nhóm X bị tạm khoá, người đăng rút về nháp, đổi lên sàn chung có đủ tỉnh và phường rồi gửi
- **THEN** lý do "nhóm bị tạm khoá" được gỡ và tin chuyển sang đang kiểm ở sàn chung

#### Scenario: Gia hạn kèm đổi nơi đăng

- **WHEN** tin hết hạn đang tạm ẩn vì người đăng bị cấm khỏi nhóm X được gia hạn kèm đổi lên sàn chung có đủ tỉnh và phường
- **THEN** lý do "bị cấm khỏi nhóm" được gỡ và tin chuyển sang đang kiểm ở sàn chung

### Requirement: Tạm ẩn theo trạng thái hiện tại, không theo thứ tự xử

Lý do tạm ẩn của tài khoản bị khoá, nhóm bị tạm khoá, bị cấm khỏi nhóm, đã rời nhóm và danh mục bị tắt SHALL khớp
với trạng thái hiện tại của tài khoản, nhóm, lệnh cấm, tư cách thành viên và danh mục — bất kể các thay đổi được
hệ thống xử theo thứ tự nào, hay một thay đổi cũ được xử lại sau thay đổi mới (chốt 15/10/2026).

#### Scenario: Khoá nhóm được xử lại sau khi mở khoá

- **WHEN** master khoá rồi mở khoá nhóm, và hệ thống xử lại lượt khoá sau lượt mở khoá
- **THEN** tin của nhóm vẫn hiện, không mang lý do "nhóm bị tạm khoá"

#### Scenario: Rời nhóm được xử lại sau khi vào lại

- **WHEN** thành viên rời rồi vào lại nhóm, và hệ thống xử lại lượt rời sau lượt vào lại
- **THEN** tin "chỉ thành viên" của người đó vẫn hiện

#### Scenario: Mở khoá tài khoản được xử lại sau khi khoá lần nữa

- **WHEN** master khoá, mở khoá rồi khoá lại một tài khoản, và hệ thống xử lại lượt mở khoá sau cùng
- **THEN** tin của người đó vẫn tạm ẩn với lý do "tài khoản bị khoá"

### Requirement: Tin còn việc chờ người duyệt không chuyển lên sàn chung được

Tin đã rời nhóm hẳn mà còn việc chờ người duyệt — kể cả việc điều hành nhóm chuyển lên staff — MUST NOT chuyển lên sàn
chung, để không ai chuyển tin đi cho thoát việc đang chờ (TK 27 cam kết 19, chốt 15/10/2026).

#### Scenario: Chuyển tin đang chờ staff xem

- **WHEN** điều hành nhóm gỡ tin khỏi nhóm kèm "trái quy định sàn" và người đăng chuyển tin đó lên sàn chung trước khi staff xử
- **THEN** response có HTTP 409 `PLACEMENT_LOCKED` và không tin mới nào được tạo

#### Scenario: Staff bác rồi chuyển

- **WHEN** staff bác việc nhóm chuyển lên, rồi người đăng chuyển tin lên sàn chung
- **THEN** tin mới được tạo ở sàn chung và chuyển sang đang kiểm
