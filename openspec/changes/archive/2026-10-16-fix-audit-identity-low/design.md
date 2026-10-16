# Design

> **Đã duyệt 16/10/2026.** Người dùng giao tech lead chọn phương án ("giải quyết những vấn đề ở đợt 4 luôn"), theo tiêu
> chí chạy ổn với lượng lớn người dùng.

## Context

- Nguồn: `docs/RA-SOAT-15-10-2026.md` mục L1, L2, L3 (phần trần phiên), L12, đọc lại ở fa15b84.
- Bảng `accounts` không có cột nào cho biết email đã xác nhận ngoài `status` (`pending_verification` → `active`); khoá
  ghi đè `status` thành `locked` nên mở khoá không còn biết trạng thái cũ.
- `openSession` (`identity.shared.ts`) đọc phiên đang sống, thu hồi phần vượt trần, rồi tạo phiên — ba lượt ghi rời.

## Decisions

### 1. Trạng thái trước khi khoá (L1)

- Cột mới `accounts.status_before_lock account_status NULL`.
- Khoá (`lockAccount`, cùng transaction cũ): `SELECT status … FOR UPDATE` rồi ghi `status = 'locked'`,
  `status_before_lock = <status vừa đọc>`. Mở khoá: `status = COALESCE(status_before_lock, 'active')`,
  `status_before_lock = NULL`.
- CHECK viết tay `accounts_status_before_lock_check`: cột trống, hoặc tài khoản đang khoá và cột là `active` hay
  `pending_verification`.
- Migration: thêm cột → tài khoản đang khoá ghi `'active'` (đúng điều mở khoá cũ sẽ làm) → CHECK.
- Mở khoá về chưa xác nhận: không phát `identity.account.verified`; lượt dọn đăng ký dở dang (7 ngày) lại thấy tài khoản —
  đúng như chưa từng bị khoá.
- Bỏ: chặn khoá tài khoản chưa xác nhận — master vẫn cần khoá được tài khoản spam đang chờ xác nhận.

### 2. Không tự xử việc của mình (L2)

- `clearFlag`: đánh dấu thuộc chính người gỡ và người đó không phải master → 403 `FORBIDDEN`.
- `decideIdVerification`: hồ sơ của chính người duyệt và người đó không phải master → 403 `FORBIDDEN`. Ghi có điều
  kiện: `updateMany … WHERE id AND status = 'pending'`; 0 dòng → 409 `CONFLICT` "Hồ sơ này đã được duyệt", không ghi
  nhật ký.

### 3. Trần phiên trong một transaction (L3)

- Repository mới `openSessionCapped({ accountId, cap, at, data })`: transaction → `pg_advisory_xact_lock` theo
  `sessions:<accountId>` → đọc phiên chưa thu hồi, còn hạn, xếp lần hoạt động cuối mới trước → thu hồi phần vượt
  (`evicted`) → tạo phiên → trả `{ session, evictedIds }`. Service ngắt realtime của phiên bị đẩy sau commit như cũ.
- Hai lượt đăng nhập cùng lúc xếp hàng trên khoá; lượt sau thấy phiên của lượt trước.

### 4. Sự kiện khi mở khoá gỡ đánh dấu (L12)

- `unlockAccount` (repository): `updateManyAndReturn` các đánh dấu `device_of_locked_account` trỏ tới tài khoản vừa mở
  khoá, rồi thêm một `identity.device.flag_cleared` `{ accountId, kind }` cho mỗi dòng — cùng payload với đường gỡ qua
  hỗ trợ.

## Risks / Trade-offs

- Khoá advisory theo tài khoản giữ trong lúc mở phiên (vài mili giây) — đăng nhập của cùng một tài khoản xếp hàng, không
  ảnh hưởng tài khoản khác.
- Tài khoản đang khoá lúc migrate mở khoá sẽ thành "đang hoạt động" dù có thể chưa từng xác nhận — như hành vi cũ; số
  dòng nhỏ.
