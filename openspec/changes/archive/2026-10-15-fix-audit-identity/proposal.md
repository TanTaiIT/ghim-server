# Proposal

## Why

Đợt 3 phần A1 của lượt sửa lỗi rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`): phiên và đổi email. Đọc lại ở
HEAD 06f71ae, chưa mục nào được sửa:

- **T11** — tab thứ hai hay lượt thử lại gửi token làm mới vừa bị thay → bị coi là token lộ, cả phiên bị thu hồi. Người
  dùng thật bị đăng xuất vì một lượt gửi trùng.
- **T12** — đổi email không xác thực lại: chỉ cần token truy cập là đổi được email đăng nhập, không báo email cũ, không
  đăng xuất thiết bị khác. Token bị lộ đủ để chiếm hẳn tài khoản (đổi email rồi "quên mật khẩu").

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án theo tiêu chí chạy ổn với lượng lớn
người dùng (15/10/2026).

## What Changes

- **T11**: token làm mới vừa bị thay, gửi lại trong 30 giây (con số mới `identity.refreshGraceSeconds`) sau lượt thay →
  409 `REFRESH_CONFLICT`, phiên không bị thu hồi, không cấp token nào. Quá 30 giây vẫn thu hồi cả phiên như cũ.
- **T12**:
  - xin đổi email đòi mật khẩu hiện tại, và mã từ ứng dụng tạo mã nếu đã bật lớp thứ hai; sai → 401
    `INVALID_CREDENTIALS`, không gửi mã;
  - tài khoản chỉ có Google (chưa có mật khẩu) → 409 `PASSWORD_NOT_SET`: đặt mật khẩu qua "quên mật khẩu" trước;
  - xác nhận email mới thì thu hồi mọi phiên khác (lý do mới `email_changed`) và gửi thư báo tới email cũ, email mới
    che bớt;
  - ba route kiểm bí mật của người đã đăng nhập (xin đổi email, xác nhận, đổi mật khẩu) dùng rate limit của route khách.

**Phá vỡ**: body `POST /me/email-change` thêm `currentPassword` (bắt buộc), `totpCode` (tuỳ). Chưa có app nào dùng.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `identity/sessions`: sửa "Làm mới phiên" — khoảng 30 giây sau lượt thay không thu hồi phiên.
- `identity/email-change`: thêm "Xin đổi email phải nhập lại mật khẩu", "Đổi email xong báo email cũ và đăng xuất thiết
  bị khác".

## Impact

- **Code**: `identity` (làm mới phiên, đổi email, route `/me`, thư báo, job gửi thư báo), bảng con số.
- **Migration**: giá trị `email_changed` của enum `session_revoke_reason`; tiêu mọi mã đổi email còn sống (lượt xin
  trước bản này không qua mật khẩu). Không mất dữ liệu.
