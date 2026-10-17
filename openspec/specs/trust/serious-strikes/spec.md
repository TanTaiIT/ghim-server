# trust/serious-strikes Specification

## Purpose

Dừng ngay người bán hàng cấm hay lừa đảo đã xác nhận bằng gậy nghiêm trọng, rồi để master — và chỉ master —
quyết số phận tài khoản, không bao giờ để nó tự mở khoá (TK 22).

## Requirements

### Requirement: Gậy nghiêm trọng khoá tài khoản ngay

Khi một gậy nghiêm trọng được ra, tài khoản nhận gậy SHALL bị khoá ngay và mọi tin của người đó tạm ẩn như mọi
lần khoá tài khoản. Gậy nghiêm trọng MUST NOT có ngày hết hạn; tài khoản giữ khoá tới khi master quyết.

#### Scenario: Staff ra gậy nghiêm trọng

- **WHEN** staff xử một báo cáo hàng cấm là đúng và ra gậy nghiêm trọng kèm điều trích
- **THEN** tài khoản bị khoá ngay, mọi phiên đăng nhập bị thu hồi và mọi tin của người đó tạm ẩn

#### Scenario: Đăng nhập sau khi bị khoá

- **WHEN** chủ tài khoản đó đăng nhập đúng email và mật khẩu
- **THEN** response có HTTP 403 `ACCOUNT_LOCKED` kèm lý do là điều đã trích

### Requirement: Kênh hỗ trợ cho người bị khoá vì gậy nghiêm trọng

Người bị khoá vì gậy nghiêm trọng SHALL xem được lý do và gửi khiếu nại qua kênh hỗ trợ không cần đăng nhập,
sau khi chứng minh sở hữu email đã đăng ký của tài khoản. Khiếu nại SHALL gửi được một lần, trong 30 ngày kể
từ khi nhận gậy (giá trị khởi đầu).

#### Scenario: Gửi khiếu nại trong hạn

- **WHEN** người bị khoá chứng minh sở hữu email đã đăng ký và gửi khiếu nại ở ngày thứ 20
- **THEN** response có HTTP 201 và khiếu nại ở trạng thái chờ master xét

#### Scenario: Chưa chứng minh sở hữu email

- **WHEN** ai đó gửi khiếu nại qua kênh hỗ trợ mà không chứng minh được sở hữu email đã đăng ký
- **THEN** response có HTTP 401 `UNAUTHORIZED` và không lộ lý do khoá

#### Scenario: Quá 30 ngày

- **WHEN** người bị khoá gửi khiếu nại ở ngày thứ 31
- **THEN** response có HTTP 409 `APPEAL_WINDOW_CLOSED`

#### Scenario: Khiếu nại lần hai

- **WHEN** người đã khiếu nại gậy nghiêm trọng gửi khiếu nại lần nữa
- **THEN** response có HTTP 409 `APPEAL_ALREADY_USED`

### Requirement: Chỉ master quyết gậy nghiêm trọng

Chỉ master SHALL quyết một gậy nghiêm trọng, kể cả khi xét khiếu nại về nó, và MUST chọn đúng một trong ba:
khoá vĩnh viễn, hạ thành gậy nặng, hoặc huỷ gậy. Gậy do chính một master ra SHALL do master kia (chính hoặc dự
phòng) quyết; master đã ra gậy MUST NOT tự quyết gậy đó.

#### Scenario: Staff thử quyết

- **WHEN** một tài khoản mang quyền staff quyết một gậy nghiêm trọng
- **THEN** response có HTTP 403 `FORBIDDEN` và tài khoản vẫn khoá

#### Scenario: Lựa chọn không hợp lệ

- **WHEN** master gửi quyết định không thuộc ba lựa chọn
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và gậy vẫn chờ quyết

#### Scenario: Gậy do master ra

- **WHEN** master chính ra một gậy nghiêm trọng
- **THEN** việc chờ quyết gậy đó nằm trong hàng chờ của master dự phòng, không trong hàng chờ của master chính

#### Scenario: Master tự quyết gậy mình ra

- **WHEN** master chính quyết gậy nghiêm trọng do chính mình ra
- **THEN** response có HTTP 403 `FORBIDDEN` và gậy vẫn chờ quyết

### Requirement: Staff chỉ ghi nhận xét về gậy nghiêm trọng

Staff SHALL ghi được nhận xét vào hồ sơ của một gậy nghiêm trọng đang chờ quyết, để master tham khảo; master
xét gậy đó SHALL thấy mọi nhận xét kèm tên staff đã ghi. Nhận xét MUST NOT đổi trạng thái của gậy, của khiếu nại
hay của việc khoá tài khoản.

#### Scenario: Staff ghi nhận xét

- **WHEN** staff ghi một nhận xét vào hồ sơ của gậy nghiêm trọng đang chờ master quyết
- **THEN** response có HTTP 201, gậy vẫn chờ quyết, tài khoản vẫn khoá, và master thấy nhận xét kèm tên staff
  khi xét

#### Scenario: Nhận xét bỏ trống

- **WHEN** staff gửi một nhận xét không có nội dung
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và hồ sơ không đổi

#### Scenario: Người dùng không mang quyền staff

- **WHEN** một tài khoản không mang quyền staff ghi nhận xét vào hồ sơ của gậy nghiêm trọng
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Khoá vĩnh viễn

Khi master chọn khoá vĩnh viễn, tài khoản SHALL giữ khoá tới khi master gỡ khoá, việc chờ quyết SHALL rời bảng
tồn, và email của tài khoản SHALL bị chặn đăng ký tới khi gỡ khoá. Khoá vĩnh viễn và việc chặn email MUST NOT tự
hết theo thời gian.

#### Scenario: Master khoá vĩnh viễn

- **WHEN** master chọn khoá vĩnh viễn cho một gậy nghiêm trọng
- **THEN** tài khoản vẫn khoá, việc không còn trên bảng tồn và email của tài khoản bị chặn đăng ký

### Requirement: Master xem lại khoá vĩnh viễn mỗi 2 năm

Cứ 2 năm (giá trị khởi đầu) kể từ lúc khoá vĩnh viễn hay từ lần xem lại trước, khoá đó SHALL vào bảng tồn của
master để xem lại, và master MUST chọn giữ tiếp hoặc gỡ khoá. Giữ tiếp thì lần xem lại kế tiếp sau 2 năm nữa.
Gỡ khoá thì tài khoản SHALL được mở khoá và email SHALL hết bị chặn đăng ký. Chưa có quyết định thì khoá và
việc chặn email MUST giữ nguyên.

#### Scenario: Tới hạn xem lại

- **WHEN** một tài khoản đã bị khoá vĩnh viễn tròn 2 năm
- **THEN** việc xem lại khoá đó nằm trên bảng tồn của master

#### Scenario: Master giữ tiếp

- **WHEN** master chọn giữ tiếp ở lần xem lại
- **THEN** tài khoản vẫn khoá, email vẫn bị chặn đăng ký và lần xem lại kế tiếp tới sau 2 năm nữa

#### Scenario: Master gỡ khoá

- **WHEN** master chọn gỡ khoá ở lần xem lại
- **THEN** tài khoản được mở khoá và email của nó hết bị chặn đăng ký

#### Scenario: Quá hạn xem lại mà chưa ai quyết

- **WHEN** việc xem lại đã nằm trên bảng tồn 30 ngày mà master chưa quyết
- **THEN** tài khoản vẫn khoá và email vẫn bị chặn đăng ký

#### Scenario: Staff thử xem lại

- **WHEN** một tài khoản mang quyền staff chọn gỡ khoá ở lần xem lại
- **THEN** response có HTTP 403 `FORBIDDEN`, tài khoản vẫn khoá và email vẫn bị chặn đăng ký

### Requirement: Hạ thành gậy nặng

Khi master hạ gậy nghiêm trọng thành gậy nặng, tài khoản SHALL được mở khoá và gậy trở thành gậy nặng 2 điểm,
hết hạn sau 180 ngày (giá trị khởi đầu) tính từ ngày ra gậy nghiêm trọng, không tính từ ngày quyết.

#### Scenario: Hạ ở ngày thứ 20

- **WHEN** gậy nghiêm trọng được ra ở ngày 0 và master hạ thành gậy nặng ở ngày 20
- **THEN** chủ tài khoản đăng nhập lại được, gậy có 2 điểm và hết hạn ở ngày 180

### Requirement: Huỷ gậy nghiêm trọng

Khi master huỷ gậy nghiêm trọng, tài khoản SHALL được mở khoá, gậy bị huỷ nhưng vẫn còn trong lịch sử, và mọi
tin tạm ẩn vì lần khoá đó SHALL hiện lại.

#### Scenario: Master huỷ gậy

- **WHEN** master huỷ một gậy nghiêm trọng
- **THEN** chủ tài khoản đăng nhập lại được, gậy ở trạng thái đã huỷ và mọi tin tạm ẩn vì lần khoá hiện lại

### Requirement: Không tự mở khoá khi chờ master

Tài khoản khoá vì gậy nghiêm trọng MUST NOT tự mở khoá, dù master chưa quyết bao lâu. Việc chờ master quyết
SHALL nằm trên bảng tồn; quá 72 giờ (giá trị khởi đầu) thì hệ thống SHALL nhắc master mỗi ngày tới khi có
quyết định.

#### Scenario: Chờ 10 ngày

- **WHEN** một gậy nghiêm trọng đã chờ master quyết 10 ngày
- **THEN** tài khoản vẫn khoá, việc vẫn trên bảng tồn và master đã được nhắc mỗi ngày kể từ sau giờ thứ 72

#### Scenario: Chưa tới 72 giờ

- **WHEN** một gậy nghiêm trọng mới chờ master quyết 48 giờ
- **THEN** việc nằm trên bảng tồn và chưa có lời nhắc nào
