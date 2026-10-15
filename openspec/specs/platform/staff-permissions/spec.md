# platform/staff-permissions Specification

## Purpose

Cho master giao việc xử tin sàn theo danh mục và ba việc toàn hệ thống cho một người, dưới dạng một quyền
gắn lên chính tài khoản cá nhân của họ, và treo quyền đó khi tài khoản bị khoá (TK 5, TK 6).

## Requirements

### Requirement: Quyền staff gắn lên tài khoản cá nhân

Master SHALL gắn được quyền staff lên một tài khoản người dùng đã có, kèm phạm vi quyền. Gắn quyền MUST NOT
tạo tài khoản mới: người đó vẫn đăng nhập bằng email, mật khẩu cũ vào chính tài khoản của mình.

#### Scenario: Gắn quyền theo danh mục

- **WHEN** master gắn quyền staff cho tài khoản của Hùng với danh mục Điện thoại và Máy tính
- **THEN** Hùng đăng nhập bằng thông tin cũ vào đúng tài khoản đó, tài khoản mang quyền staff trên đúng hai
  danh mục ấy, và không tài khoản mới nào được tạo

#### Scenario: Tài khoản không tồn tại

- **WHEN** master gắn quyền staff cho một mã tài khoản không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND`

#### Scenario: Danh mục không tồn tại

- **WHEN** master gắn quyền staff kèm một danh mục không tồn tại
- **THEN** response có HTTP 404 `NOT_FOUND` và tài khoản không mang thêm quyền nào

#### Scenario: Phạm vi rỗng

- **WHEN** master gắn quyền staff mà không kèm danh mục hay việc toàn hệ thống nào
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

#### Scenario: Chỉ việc toàn hệ thống, không danh mục

- **WHEN** master gắn quyền staff chỉ gồm việc hỗ trợ người dùng, không kèm danh mục nào
- **THEN** response có HTTP 200 và tài khoản mang đúng việc đó, không danh mục nào

#### Scenario: Tài khoản đang bị khoá hoặc chưa xác nhận email

- **WHEN** master gắn quyền staff cho một tài khoản đang bị khoá, hoặc chưa xác nhận email
- **THEN** response có HTTP 409 `STAFF_PERMISSION_INELIGIBLE` kèm lý do, và tài khoản không mang quyền nào

### Requirement: Ba việc toàn hệ thống

Ngoài danh mục, master SHALL giao được cho staff một hay nhiều trong ba việc toàn hệ thống: hỗ trợ người
dùng, xử báo cáo về người, duyệt giấy tờ xác minh. MUST NOT có việc toàn hệ thống nào khác.

#### Scenario: Giao việc duyệt giấy tờ

- **WHEN** master giao thêm việc duyệt giấy tờ xác minh cho một staff của danh mục Điện thoại
- **THEN** staff đó mang cả danh mục Điện thoại lẫn việc duyệt giấy tờ

#### Scenario: Việc không có trong danh sách

- **WHEN** master giao cho staff một việc toàn hệ thống không thuộc ba việc trên
- **THEN** response có HTTP 400 `VALIDATION_ERROR`

### Requirement: Nhiều staff một danh mục

Một danh mục SHALL có được nhiều staff cùng lúc. Gắn thêm staff cho một danh mục MUST NOT thu hay đổi quyền
của các staff đang có ở danh mục đó.

#### Scenario: Hai staff cùng danh mục

- **WHEN** master gắn danh mục Điện thoại cho Hùng rồi cho Mai
- **THEN** danh sách staff của danh mục Điện thoại có cả Hùng lẫn Mai, và quyền của Hùng không đổi

### Requirement: Master xem danh sách staff

Master SHALL xem được danh sách tài khoản mang quyền staff, mỗi người kèm danh mục, việc toàn hệ thống và
tình trạng quyền — đang hiệu lực, hay đang treo kèm lý do — và lọc được theo danh mục.

#### Scenario: Lọc theo danh mục

- **WHEN** master xem danh sách staff của danh mục Xe máy
- **THEN** response có HTTP 200 với mọi tài khoản mang danh mục Xe máy, kể cả người đang bị treo quyền

#### Scenario: Người dùng thường xem danh sách staff

- **WHEN** một tài khoản không mang quyền staff gọi thao tác xem danh sách staff
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Chỉ master cấp và sửa quyền staff

Chỉ master SHALL gắn, sửa phạm vi và thu quyền staff qua bàn vận hành. Staff MUST NOT gắn hay thu quyền của
ai qua bàn vận hành, kể cả của chính mình. Hệ thống tự treo quyền khi tài khoản bị khoá và tự thu quyền khi tài
khoản bị xoá (các requirement riêng); đó không phải thao tác của staff hay master.

#### Scenario: Staff thử gắn quyền cho người khác

- **WHEN** một staff gắn quyền staff cho một tài khoản khác
- **THEN** response có HTTP 403 `FORBIDDEN` và tài khoản kia không mang quyền nào

#### Scenario: Staff thử mở rộng phạm vi của mình

- **WHEN** staff của danh mục Điện thoại tự thêm danh mục Xe máy vào quyền của mình
- **THEN** response có HTTP 403 `FORBIDDEN`

### Requirement: Thu quyền có hiệu lực ngay

Khi master thu một danh mục, một việc toàn hệ thống hay toàn bộ quyền staff, thao tác kế tiếp của người bị
thu trên phần đó MUST bị từ chối ngay, không chờ người đó đăng nhập lại.

#### Scenario: Thu một danh mục

- **WHEN** master thu danh mục Máy tính của Hùng trong lúc Hùng đang đăng nhập
- **THEN** thao tác kế tiếp của Hùng trên Máy tính nhận HTTP 403 `FORBIDDEN`, còn trên Điện thoại vẫn làm được

#### Scenario: Thu toàn bộ quyền

- **WHEN** master thu toàn bộ quyền staff của Hùng
- **THEN** mọi thao tác của bàn vận hành do Hùng gọi nhận HTTP 403 `FORBIDDEN`, và Hùng vẫn dùng app như một
  người dùng

### Requirement: Staff chỉ làm việc trong phạm vi được giao

Staff SHALL chỉ làm được thao tác của bàn vận hành thuộc danh mục và việc toàn hệ thống đã được giao. Ngoài
phạm vi đó, staff MUST bị từ chối như một người dùng không mang quyền staff.

#### Scenario: Danh mục không được giao

- **WHEN** staff của danh mục Điện thoại làm một thao tác của bàn vận hành trên danh mục Xe máy
- **THEN** response có HTTP 403 `FORBIDDEN`

#### Scenario: Việc toàn hệ thống không được giao

- **WHEN** một staff không có việc hỗ trợ người dùng gỡ đánh dấu thiết bị cho một tài khoản
- **THEN** response có HTTP 403 `FORBIDDEN` và đánh dấu vẫn giữ nguyên

### Requirement: Tài khoản bị khoá thì quyền staff tự treo

Khi tài khoản mang quyền staff bị khoá, quyền staff SHALL tự treo ngay và giữ nguyên phạm vi. Quyền đang treo
MUST NOT cho làm thao tác nào của bàn vận hành.

#### Scenario: Master khoá tài khoản của một staff

- **WHEN** master khoá tài khoản của Hùng, đang là staff danh mục Điện thoại
- **THEN** danh sách staff hiện Hùng "đang treo" với lý do "tài khoản bị khoá", phạm vi vẫn là Điện thoại

#### Scenario: Quyền treo vẫn là quyền staff với đăng nhập

- **WHEN** tài khoản có quyền đang treo được mở khoá và đăng nhập lại
- **THEN** vẫn phải đưa mã lớp thứ hai nếu đã bật, và vẫn chịu trần 3 phiên như staff

### Requirement: Chỉ master trả lại quyền đang treo

Mở khoá tài khoản MUST NOT tự trả lại quyền staff. Quyền SHALL treo cho tới khi master trả lại — đúng phạm vi
lúc treo — hoặc thu hẳn. Tài khoản còn bị khoá thì không trả lại được.

#### Scenario: Mở khoá rồi gọi bàn vận hành

- **WHEN** tài khoản của Hùng được mở khoá và Hùng gọi một thao tác của bàn vận hành
- **THEN** response có HTTP 403 `STAFF_PERMISSION_SUSPENDED`

#### Scenario: Master trả lại quyền

- **WHEN** master trả lại quyền đang treo của Hùng sau khi tài khoản được mở khoá
- **THEN** Hùng làm được thao tác của bàn vận hành trên đúng danh mục Điện thoại như trước khi treo

#### Scenario: Master thu hẳn quyền đang treo

- **WHEN** master thu hẳn quyền đang treo của Hùng
- **THEN** Hùng không còn trong danh sách staff

#### Scenario: Trả lại khi tài khoản còn bị khoá

- **WHEN** master trả lại quyền staff cho một tài khoản vẫn đang bị khoá
- **THEN** response có HTTP 409 `STAFF_PERMISSION_INELIGIBLE` kèm lý do "tài khoản đang bị khoá", quyền vẫn
  treo

### Requirement: Tài khoản bị xoá thì quyền staff bị thu

Khi tài khoản mang quyền staff bị xoá, quyền staff SHALL bị thu hẳn — không treo, vì tài khoản đã xoá không quay
lại được. Việc thu do hệ thống làm, không cần master, và MUST áp cả cho quyền đang treo.

#### Scenario: Staff xoá tài khoản của mình

- **WHEN** Hùng, staff của danh mục Điện thoại, xoá tài khoản của mình
- **THEN** danh sách staff của danh mục Điện thoại không còn Hùng

#### Scenario: Quyền đang treo

- **WHEN** Mai có quyền staff đang treo (tài khoản đã được mở khoá nhưng master chưa trả lại quyền) và xoá tài
  khoản của mình
- **THEN** danh sách staff không còn Mai

#### Scenario: Xoá tài khoản không mang quyền staff

- **WHEN** một người dùng không mang quyền staff xoá tài khoản của mình
- **THEN** danh sách staff không đổi

### Requirement: Quyền staff bị treo hay bị thu thì việc đang nhận trả về hàng chờ

Khi quyền staff của một người bị treo, hoặc master thu danh mục hay toàn bộ quyền staff của người đó, mọi việc
người đó đang nhận thuộc phần bị treo hay bị thu SHALL trả về hàng chờ ngay, không đợi hết thời gian giữ, để
staff khác nhận được (TK 5).

#### Scenario: Staff bị khoá tài khoản khi đang nhận việc

- **WHEN** staff A đang nhận một việc thì tài khoản của A bị master khoá
- **THEN** việc trở về hàng chờ ngay và staff B cùng danh mục nhận được việc đó

#### Scenario: Staff bị thu một danh mục khi đang nhận việc

- **WHEN** staff A đang nhận một việc về tin Điện thoại thì master thu danh mục Điện thoại của A
- **THEN** việc trở về hàng chờ ngay và staff khác được giao Điện thoại nhận được việc đó
