# listing/display-period Specification

## Purpose

Cho mỗi tin một khoảng hiển thị có hạn, đo bằng thời gian tin thực sự được phép nằm trên bảng — không mất ngày vì
lý do ngoài người đăng, không làm mới được bằng cách sửa (TK 19, TK 26).

## Requirements

### Requirement: Ba mươi ngày từ lần lên bảng đầu tiên

Mỗi tin SHALL hiển thị 30 ngày (giá trị khởi đầu), tính từ lúc lên bảng lần đầu và không tính thời gian ngày
hiển thị bị dừng. Chỉ gia hạn mới kéo dài hay đặt lại khoảng này.

#### Scenario: Không bị dừng lần nào

- **WHEN** một tin lên bảng ngày 1 và không bị dừng ngày hiển thị lần nào
- **THEN** tin hết hạn sau đúng 30 ngày hiển thị

#### Scenario: Lên bảng sau khi chờ người duyệt

- **WHEN** một tin gửi ngày 1, bị máy giữ cho người, và được người duyệt cho đạt ngày 3
- **THEN** 30 ngày hiển thị của tin tính từ ngày 3, không phải từ lúc gửi

### Requirement: Sửa không làm mới tin

Sửa tin MUST NOT đổi ngày hết hạn hay vị trí của tin trên bảng tin, kể cả khi tin phải qua máy lại hoặc chờ người
duyệt sau khi sửa.

#### Scenario: Sửa rồi máy cho qua

- **WHEN** người đăng sửa tiêu đề một tin vào ngày hiển thị thứ 20 và máy cho qua
- **THEN** ngày hết hạn của tin giữ nguyên và tin không được đẩy lên trên các tin lên bảng sau nó

#### Scenario: Sửa rồi phải chờ người duyệt

- **WHEN** người đăng sửa một tin vào ngày hiển thị thứ 20, máy giữ cho người 2 ngày rồi người duyệt cho đạt
- **THEN** ngày hết hạn của tin vẫn như trước khi sửa

### Requirement: Ngày dừng khi tin bị gỡ

Ngày hiển thị SHALL dừng khi tin bị gỡ. Tin được khôi phục SHALL chạy tiếp số ngày còn lại từ chỗ dừng (TK 27
cam kết 21).

#### Scenario: Gỡ rồi khôi phục

- **WHEN** một tin lên bảng ngày 1, bị gỡ ngày 10 và được khôi phục ngày 15
- **THEN** tin còn 21 ngày hiển thị khi được khôi phục và hết hạn ngày 36 thay vì ngày 31

### Requirement: Ngày dừng hay trôi khi tin tạm ẩn

Khi tin tạm ẩn, ngày hiển thị SHALL dừng nếu lý do không do người đăng — nhóm bị tạm khoá, danh mục bị tắt,
người đăng bị gỡ hay bị cấm khỏi nhóm — và SHALL vẫn trôi nếu lý do là tài khoản người đăng bị khoá hoặc người
đăng tự rời nhóm (TK 19, chốt 12/10/2026).

#### Scenario: Nhóm bị tạm khoá

- **WHEN** một tin trong nhóm còn 10 ngày hiển thị thì nhóm bị tạm khoá 5 ngày rồi mở khoá
- **THEN** tin hiện lại vẫn còn 10 ngày hiển thị

#### Scenario: Danh mục bị tắt

- **WHEN** một tin còn 10 ngày hiển thị thì danh mục của nó bị tắt 3 ngày rồi bật lại
- **THEN** tin hiện lại vẫn còn 10 ngày hiển thị

#### Scenario: Tài khoản người đăng bị khoá

- **WHEN** một tin còn 10 ngày hiển thị thì tài khoản người đăng bị khoá 4 ngày rồi mở khoá
- **THEN** tin hiện lại còn 6 ngày hiển thị

#### Scenario: Hết ngày trong lúc tài khoản bị khoá

- **WHEN** một tin còn 3 ngày hiển thị thì tài khoản người đăng bị khoá 5 ngày rồi mở khoá
- **THEN** tin đã chuyển sang hết hạn trong lúc khoá, và hiện lại ở trạng thái hết hạn

#### Scenario: Người đăng tự rời nhóm

- **WHEN** một tin "chỉ thành viên" còn 10 ngày hiển thị thì người đăng rời nhóm 4 ngày rồi vào lại
- **THEN** tin hiện lại còn 6 ngày hiển thị

#### Scenario: Người ngoài bị cấm rồi được gỡ cấm

- **WHEN** một tin người ngoài còn 10 ngày hiển thị thì người đăng bị cấm khỏi nhóm 5 ngày rồi được gỡ cấm
- **THEN** tin hiện lại vẫn còn 10 ngày hiển thị

#### Scenario: Người đăng bị gỡ khỏi nhóm

- **WHEN** một tin "chỉ thành viên" còn 10 ngày hiển thị thì người đăng bị gỡ khỏi nhóm, 4 ngày sau vào lại
- **THEN** tin hiện lại vẫn còn 10 ngày hiển thị

#### Scenario: Thành viên bị cấm, gỡ cấm rồi mới vào lại

- **WHEN** một tin "chỉ thành viên" còn 10 ngày hiển thị thì người đăng bị cấm khỏi nhóm 5 ngày, được gỡ cấm, 3
  ngày sau mới vào lại nhóm
- **THEN** tin hiện lại vẫn còn 10 ngày hiển thị: cả lúc bị cấm lẫn lúc đã gỡ cấm mà chưa vào lại đều không tính

### Requirement: Hết ngày trong lúc chờ máy hay người

Tin đang kiểm hay chờ duyệt sau khi sửa mà dùng hết ngày hiển thị SHALL vẫn đi tiếp tới khi máy hay người quyết;
được cho qua hay cho đạt thì tin lên đang hiển thị rồi chuyển sang hết hạn ở lượt chạy kế tiếp (chốt 12/10/2026).

#### Scenario: Hết ngày lúc chờ người duyệt

- **WHEN** một tin còn 2 ngày hiển thị được sửa, máy giữ cho người, và người duyệt cho đạt sau 3 ngày
- **THEN** tin lên đang hiển thị rồi chuyển sang hết hạn trong vòng một giờ, và người đăng gia hạn được tin đó

### Requirement: Chuyển sang hết hạn mỗi giờ

Tin đang hiển thị đã dùng hết ngày hiển thị SHALL được chuyển sang hết hạn trong vòng một giờ (TK 26).

#### Scenario: Đủ ba mươi ngày

- **WHEN** một tin đang hiển thị dùng hết 30 ngày hiển thị
- **THEN** trong vòng một giờ sau đó tin chuyển sang hết hạn và rời bảng tin

#### Scenario: Thời gian dừng không bị tính

- **WHEN** đã 30 ngày lịch kể từ lúc một tin lên bảng nhưng tin từng bị gỡ 5 ngày trong khoảng đó
- **THEN** tin chưa chuyển sang hết hạn

### Requirement: Khi nào được gia hạn

Người đăng SHALL gia hạn được tin của mình trong 7 ngày cuối (giá trị khởi đầu) của ngày hiển thị — gia hạn sớm
— hoặc sau khi tin hết hạn. Gia hạn đưa tin qua máy lại và MUST thoả mọi điều kiện gửi như một lượt gửi tin mới,
trừ hạn mức tin sống: gia hạn sớm không chiếm thêm chỗ, gia hạn tin hết hạn cần còn chỗ (trust/quotas). Gia hạn
tin hết hạn SHALL nhận kèm sửa nội dung trong cùng một lượt qua máy (chốt 12/10/2026).

#### Scenario: Gia hạn trong bảy ngày cuối

- **WHEN** người đăng gia hạn một tin đang hiển thị còn 5 ngày
- **THEN** gia hạn được nhận và tin chuyển sang đang kiểm, đi như khi sửa tin

#### Scenario: Gia hạn tin hết hạn

- **WHEN** người đăng gia hạn một tin hết hạn
- **THEN** tin chuyển sang đang kiểm

#### Scenario: Gia hạn tin hết hạn kèm sửa

- **WHEN** người đăng gia hạn một tin hết hạn và cùng lúc hạ giá
- **THEN** tin chuyển sang đang kiểm với giá mới, và chỉ một lượt gửi được tính

#### Scenario: Gia hạn quá sớm

- **WHEN** người đăng gia hạn một tin đang hiển thị còn 12 ngày
- **THEN** response có HTTP 409 `RENEWAL_TOO_EARLY` kèm ngày bắt đầu được gia hạn, và tin không đổi

#### Scenario: Gia hạn khi danh mục đã tắt

- **WHEN** người đăng gia hạn một tin hết hạn thuộc một danh mục đang tắt
- **THEN** response có HTTP 409 `CATEGORY_DISABLED` và tin vẫn hết hạn

### Requirement: Gia hạn cộng thêm ngày nhưng không đẩy tin lên đầu

Gia hạn sớm thành công SHALL đặt ngày hết hạn mới bằng ngày hết hạn cũ cộng 30 ngày (giá trị khởi đầu), nên
không mất ngày còn lại. Gia hạn tin đã hết hạn SHALL cho tin 30 ngày hiển thị tính từ lúc tin lên bảng lại. Mọi
lần gia hạn MUST NOT đẩy tin lên đầu bảng tin.

#### Scenario: Gia hạn sớm và máy cho qua

- **WHEN** người đăng gia hạn sớm một tin hết hạn ngày 31 vào ngày 27 và máy cho qua
- **THEN** tin hiện tiếp với ngày hết hạn mới là ngày 61, và không đứng trên các tin lên bảng sau lần lên bảng
  đầu của nó

#### Scenario: Gia hạn sớm rồi phải chờ người duyệt

- **WHEN** người đăng gia hạn sớm một tin hết hạn ngày 31 vào ngày 27, máy giữ cho người và người duyệt cho đạt
  ngày 28
- **THEN** ngày hết hạn mới của tin vẫn là ngày 61

#### Scenario: Gia hạn sớm lần nữa ngay sau đó

- **WHEN** tin vừa được gia hạn sớm tới ngày 61 và người đăng gia hạn lần nữa vào ngày 28
- **THEN** response có HTTP 409 `RENEWAL_TOO_EARLY` kèm ngày bắt đầu được gia hạn, và ngày hết hạn vẫn là ngày 61

#### Scenario: Gia hạn tin hết hạn rồi phải chờ người duyệt

- **WHEN** người đăng gia hạn một tin hết hạn vào ngày 40, máy giữ cho người và người duyệt cho đạt ngày 42
- **THEN** tin trở lại đang hiển thị với 30 ngày hiển thị tính từ ngày 42, và không đứng trên các tin lên bảng
  sau lần lên bảng đầu của nó

### Requirement: Nhắc tin sắp hết hạn

Lúc 9 giờ sáng giờ Việt Nam mỗi ngày, hệ thống SHALL nhắc người đăng về từng tin đang hiển thị còn 7 ngày (giá
trị khởi đầu) tới hết hạn, kèm ngày hết hạn.

#### Scenario: Tin còn bảy ngày

- **WHEN** tới 9 giờ sáng và một tin đang hiển thị còn 7 ngày tới hết hạn
- **THEN** người đăng nhận một lời nhắc cho tin đó, kèm ngày hết hạn

#### Scenario: Tin còn nhiều ngày

- **WHEN** tới 9 giờ sáng và một tin đang hiển thị còn 15 ngày tới hết hạn
- **THEN** người đăng chưa nhận lời nhắc nào cho tin đó
