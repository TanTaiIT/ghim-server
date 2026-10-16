# Proposal

## Why

Đợt 4 phần 1 của lượt sửa lỗi rà soát ngày 15/10/2026 (`docs/RA-SOAT-15-10-2026.md`): tài khoản. Đọc lại ở HEAD fa15b84,
chưa mục nào được sửa:

- **L1** — mở khoá luôn đặt tài khoản về "đang hoạt động": khoá một tài khoản chưa xác nhận email rồi mở khoá thì tài khoản
  đó được coi là đã xác nhận, dù chưa ai nhập mã (TK 7: chỉ email đã xác nhận mới đăng tin, vào nhóm).
- **L2** — staff được giao việc hỗ trợ gỡ được đánh dấu "nhiều tài khoản trên một máy" của chính mình; staff được giao duyệt
  giấy tờ duyệt được giấy tờ của chính mình — trái nguyên tắc "không ai, trừ master, tự xử việc của mình" (TK 4, CLAUDE.md
  luật 17). Hai người cùng duyệt một hồ sơ thì cả hai đều thắng, người sau ghi đè.
- **L3** (phần trần phiên) — đếm phiên rồi mới tạo phiên ở hai bước rời: đăng nhập cùng lúc trên nhiều máy vượt được trần
  20 phiên (3 với master, staff).
- **L12** — mở khoá gỡ các đánh dấu "máy của tài khoản bị khoá" mà không phát sự kiện gỡ đánh dấu như đường gỡ qua hỗ trợ;
  bên nghe sau này của sự kiện đó sẽ lệch.

Sửa lỗi, không thuộc đợt nào của TK 29. Người dùng giao tech lead chọn phương án theo tiêu chí chạy ổn với lượng lớn
người dùng (15/10/2026, nhắc lại 16/10/2026: "giải quyết những vấn đề ở đợt 4 luôn").

## What Changes

- **L1**: khoá ghi lại trạng thái lúc khoá; mở khoá trả tài khoản về đúng trạng thái đó — tài khoản chưa xác nhận email
  vẫn chưa xác nhận (vẫn bị dọn sau 7 ngày như mọi đăng ký dở dang).
- **L2**: staff gỡ đánh dấu của chính mình hay duyệt giấy tờ của chính mình → 403 `FORBIDDEN` (master thì được). Lượt
  duyệt giấy tờ ghi có điều kiện "hồ sơ còn chờ": người sau nhận 409 `CONFLICT`, không ghi đè.
- **L3**: mở phiên (đẩy phiên ít dùng nhất ra nếu đủ trần, rồi tạo phiên) trong một transaction có khoá theo tài khoản —
  đăng nhập cùng lúc không vượt trần.
- **L12**: mở khoá phát `identity.device.flag_cleared` cho từng đánh dấu nó gỡ, như đường gỡ qua hỗ trợ. Ba sự kiện
  `identity.account.verified`, `identity.device.flagged`, `identity.device.flag_cleared` chưa có bên nghe là cố ý: chúng
  dành cho `add-notifications` (báo người dùng), bộ phát đánh dấu đã phát như mọi sự kiện.

## Capabilities

### New Capabilities

Không có.

### Modified Capabilities

- `identity/account-lock`: thêm "Mở khoá trả tài khoản về trạng thái trước khi khoá".
- `identity/id-verification`: thêm "Không ai duyệt giấy tờ của chính mình", "Hai người cùng duyệt một hồ sơ".
- `identity/device-registry`: thêm "Staff không gỡ đánh dấu của chính mình".
- `identity/sessions`: thêm "Trần phiên đúng cả khi đăng nhập cùng lúc".

## Impact

- **Code**: `identity` (khoá / mở khoá, gỡ đánh dấu, duyệt giấy tờ, mở phiên).
- **Migration**: có — `accounts.status_before_lock` (cho phép trống) và một CHECK viết tay. Tài khoản đang bị khoá lúc
  migrate được ghi "đang hoạt động" — đúng điều mở khoá cũ sẽ làm, không mất dữ liệu.
- **API**: không đổi hình dạng; thêm đường lỗi 403 (tự xử việc của mình) và 409 (hai người cùng duyệt).
