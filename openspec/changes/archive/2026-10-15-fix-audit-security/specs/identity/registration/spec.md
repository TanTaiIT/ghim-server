## MODIFIED Requirements

### Requirement: Đăng ký và đăng nhập bằng Google

Người dùng SHALL tạo được tài khoản bằng Google; email do Google xác thực được coi là đã xác nhận, không
cần mã. Email đó đã có tài khoản thì người dùng vào chính tài khoản ấy, không sinh tài khoản thứ hai. Email đó
chỉ có một đăng ký chưa xác nhận thì đăng ký dở MUST bị xoá hẳn — kể cả mật khẩu và mọi phiên của nó — và
Google tạo một tài khoản mới đã xác nhận: người giữ đăng ký dở chưa chứng minh được email là của mình (chốt
15/10/2026).

#### Scenario: Lần đầu dùng Google

- **WHEN** khách đăng nhập bằng Google với một email chưa có tài khoản
- **THEN** một tài khoản mới được tạo ở trạng thái đã xác nhận

#### Scenario: Email đã có tài khoản

- **WHEN** khách đăng nhập bằng Google với email trùng (sau chuẩn hoá) một tài khoản đã có
- **THEN** khách vào đúng tài khoản đã có và hệ thống vẫn chỉ có một tài khoản cho email đó

#### Scenario: Email thuộc một đăng ký chưa xác nhận

- **WHEN** người A đăng ký bằng email của người B kèm mật khẩu, chưa xác nhận email, rồi người B đăng nhập bằng
  Google với email đó
- **THEN** người B vào một tài khoản mới đã xác nhận, phiên của người A nhận HTTP 401 `SESSION_REVOKED`, và
  đăng nhập bằng email cùng mật khẩu của người A nhận HTTP 401 `INVALID_CREDENTIALS`
