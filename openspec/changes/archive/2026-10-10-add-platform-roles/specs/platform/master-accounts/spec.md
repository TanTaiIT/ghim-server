## Purpose

Định nghĩa master — người quản lý cao nhất của Ghim, đúng một người, chỉ do đội kỹ thuật tạo — và vị trí đứng
ngoài mọi giới hạn quyền của bàn vận hành, với quyết định là cuối cùng (TK 1 quyết định 4, TK 5, TK 6, nguyên
tắc 3).

## ADDED Requirements

### Requirement: Master chỉ do đội kỹ thuật tạo

Tài khoản master SHALL chỉ được tạo bằng công cụ của đội kỹ thuật chạy trực tiếp trên hệ thống. MUST NOT có
đường HTTP nào — kể cả của bàn vận hành, kể cả do master gọi — tạo master hay nâng một tài khoản thành
master.

#### Scenario: Đội kỹ thuật tạo master

- **WHEN** đội kỹ thuật chạy công cụ tạo master với một email chưa có tài khoản
- **THEN** tài khoản master được tạo ở trạng thái đã xác nhận mà không qua đăng ký trên app

#### Scenario: Email đã thuộc một tài khoản

- **WHEN** đội kỹ thuật chạy công cụ tạo master với một email trùng (sau chuẩn hoá) tài khoản đã có
- **THEN** công cụ từ chối và không tài khoản nào thành master

#### Scenario: Đăng ký qua app

- **WHEN** khách đăng ký một tài khoản qua app
- **THEN** tài khoản mới là tài khoản người dùng, không mang quyền master hay quyền staff

#### Scenario: Master thử nâng người khác thành master

- **WHEN** master dùng thao tác gắn quyền của bàn vận hành để đặt một tài khoản thành master
- **THEN** response có HTTP 400 `VALIDATION_ERROR` và tài khoản đó không thành master

### Requirement: Đúng một master

Hệ thống SHALL có đúng một tài khoản master. Công cụ của đội kỹ thuật MUST từ chối tạo master thứ hai, và
MUST NOT có luồng thay hay bỏ master trong app. Master mất ứng dụng tạo mã thì đội kỹ thuật đặt lại lớp thứ
hai bằng công cụ chạy tay; không ai khác làm được.

#### Scenario: Tạo master thứ hai

- **WHEN** đã có một master và đội kỹ thuật chạy công cụ tạo thêm một master
- **THEN** công cụ từ chối và hệ thống vẫn chỉ có một master

#### Scenario: Đặt lại lớp thứ hai cho master

- **WHEN** đội kỹ thuật chạy công cụ đặt lại lớp thứ hai cho master
- **THEN** lớp thứ hai bị gỡ, master đăng nhập lại được bằng mật khẩu, và phải thiết lập lại ứng dụng tạo mã
  trước khi dùng bàn vận hành

### Requirement: Master toàn quyền ở bàn vận hành

Master SHALL làm được mọi thao tác của bàn vận hành trên mọi danh mục và mọi việc toàn hệ thống mà không cần
được gắn quyền. Kiểm tra phạm vi quyền staff MUST NOT áp lên master.

#### Scenario: Danh mục chưa giao cho staff nào

- **WHEN** master làm một thao tác của bàn vận hành trên một danh mục chưa giao cho staff nào
- **THEN** thao tác thành công

#### Scenario: Việc toàn hệ thống chưa giao cho ai

- **WHEN** master làm một thao tác thuộc việc hỗ trợ người dùng trong lúc chưa staff nào được giao việc đó
- **THEN** thao tác thành công

### Requirement: Thao tác của master có hiệu lực ngay và là cuối cùng

Thao tác của master SHALL có hiệu lực ngay, không chờ người thứ hai duyệt hay xác nhận. Không có cấp nào xét
lại thao tác của master: chỉ chính master MUST đổi lại được thao tác của mình, bằng một thao tác sau.

#### Scenario: Không chờ người thứ hai

- **WHEN** master khoá một tài khoản
- **THEN** tài khoản bị khoá ngay, không có bước chờ ai duyệt

#### Scenario: Master đổi lại thao tác của chính mình

- **WHEN** master thu quyền staff của một tài khoản rồi gắn lại quyền đó
- **THEN** tài khoản mang lại quyền staff theo thao tác sau cùng
