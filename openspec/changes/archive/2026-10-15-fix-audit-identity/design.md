# Design

> **Đã duyệt 15/10/2026.** Người dùng giao tech lead chọn phương án ("tiếp giúp tôi"), theo tiêu chí chạy ổn với lượng
> lớn người dùng.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục T11, T12, đọc lại ở 06f71ae.
- Làm mới phiên xoay token mỗi lần; token vừa bị thay nằm ở `sessions.prev_refresh_token_hash`. Ai gửi lại nó hiện bị
  coi là kẻ trộm.
- `sessions.last_active_at` chỉ được ghi lúc mở phiên và lúc xoay token — nó chính là mốc của lượt thay gần nhất.

## Decisions

### 1. Khoảng ân hạn sau lượt thay token (T11)

- Token gửi lên trùng `prev_refresh_token_hash` và `last_active_at + identity.refreshGraceSeconds > now` → 409
  `REFRESH_CONFLICT`, không thu hồi, không cấp gì. Quá khoảng đó → thu hồi như cũ (`refresh_reuse`).
- Ân hạn không trao token cho người cầm token cũ, chỉ hoãn phán "token lộ" — kẻ trộm cầm token cũ trong 30 giây không
  được gì, và lượt gửi sau 30 giây vẫn làm phiên bị thu hồi.
- Con số `identity.refreshGraceSeconds`: khởi đầu 30, trong 1–300. Lớn hơn là bỏ lỡ dấu hiệu token lộ quá lâu.
- Không thêm cột `rotated_at`: `last_active_at` không được ghi ở nơi nào khác. Ghi chú ở chỗ kiểm để người sau không
  biến nó thành "lần gọi API gần nhất".
- Bỏ: cấp lại token trong ân hạn (kiểu "reuse interval") — hai tab xoay đè nhau liên tục, và người cầm token cũ nhận
  được token mới.

### 2. Xác thực lại khi xin đổi email (T12)

- Kiểm ở lượt **xin**, trước mọi luật khác (tần suất, trùng email): người cầm token lộ không gửi được mã, cũng không dò
  được email nào đã có tài khoản.
- Đòi `currentPassword`; tài khoản đã bật lớp thứ hai (`totpEnabledAt`) đòi thêm `totpCode`. Sai → 401
  `INVALID_CREDENTIALS` như đổi mật khẩu.
- Chỉ có Google (`passwordHash` trống) → 409 `PASSWORD_NOT_SET`. Phương án khác (đòi Google ID token mới) cần app gọi
  Google ở giữa luồng; đặt mật khẩu qua "quên mật khẩu" đã có sẵn.

### 3. Sau khi xác nhận email mới (T12)

- `applyAccountChange` thu hồi mọi phiên khác trong cùng transaction (lý do mới `email_changed`), như đổi mật khẩu; báo
  kênh realtime sau khi ghi.
- Thư báo tới email cũ qua job mới `identity.send-notice` (`{ to, kind: 'email_changed', newEmail }`, `newEmail` đã che:
  ký tự đầu + `***` + `@miền`). Xếp sau khi ghi, như thư mã — gửi hỏng thì job thử lại; mất thư báo không làm hỏng lượt
  đổi.

### 4. Rate limit

- `POST /me/email-change`, `POST /me/email-change/confirm`, `PUT /me/password` dùng `identity.authRateLimitPerMinute`
  như route khách: cả ba kiểm một bí mật (mật khẩu, mã), token lộ không được dò mật khẩu thoải mái.

### 5. Migration

- File riêng thêm `email_changed` vào `session_revoke_reason`.
- File sau tiêu mọi mã `email_change` chưa tiêu: lượt xin trước bản này không qua mật khẩu nên không được xác nhận nữa.
  Người dùng thật chỉ cần xin lại.

## Risks / Trade-offs

- Rate limit theo IP: kẻ trộm đổi IP vẫn dò được chậm. Chấp nhận ở bản này — đếm sai theo tài khoản chưa có ở đâu
  trong `identity` (đăng nhập cũng chỉ theo IP); làm thì làm chung cho mọi lượt kiểm mật khẩu.
