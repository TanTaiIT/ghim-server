# Proposal

## Why

TK 5 và TK 27 cam kết 28 bắt master và mọi tài khoản mang quyền staff đăng nhập hai lớp bằng ứng dụng tạo mã; thiếu
lớp thứ hai thì bàn vận hành trả 403 `TWO_FACTOR_REQUIRED`. Ngày 23/10/2026 người dùng chốt bỏ hẳn lớp thứ hai: với
quy mô hiện tại nó không đáng cái giá vận hành — mỗi staff mới phải cài ứng dụng tạo mã trước khi làm được việc gì,
mất máy thì phải nhờ đội kỹ thuật chạy công cụ đặt lại, app phải giữ một màn chặn riêng (`TwoFactorGate`) và đăng nhập
Google bị chặn với tài khoản có quyền đã bật hai lớp.

Người dùng chấp nhận rủi ro: bàn vận hành (khoá tài khoản, xem hội thoại làm bằng chứng, duyệt giấy tờ tuỳ thân) từ
nay chỉ còn mật khẩu bảo vệ, cùng các lớp đã có — trần 3 phiên cho master và staff, thu hồi phiên khi đổi mật khẩu,
khoá tài khoản, giới hạn tần suất. Không thay bằng lớp nào khác (mã qua email đã được hỏi và không chọn).

Đây là change đổi luật đã archive (`add-identity`, `add-platform-roles`, `fix-audit-security`, `fix-audit-identity`),
không thuộc đợt nào của TK 29.

## What Changes

- **BREAKING** Bàn vận hành không đòi lớp thứ hai nữa: master và staff có quyền đúng phạm vi là làm được ngay sau khi
  đăng nhập bằng mật khẩu (hoặc Google). Mã lỗi `TWO_FACTOR_REQUIRED` và `TWO_FACTOR_ENABLED` không còn.
- **BREAKING** Bỏ hai route thiết lập lớp thứ hai (`POST /me/two-factor/setup`, `POST /me/two-factor/confirm`) — gọi
  vào nhận 404 như route không tồn tại.
- Đăng nhập bằng mật khẩu và xin đổi email không đọc mã từ ứng dụng tạo mã nữa. Client cũ còn gửi trường `totpCode`
  vẫn chạy: trường bị bỏ qua.
- Tài khoản có quyền đăng nhập bằng Google được như mọi người (trước đây bị chặn khi đã bật hai lớp).
- Hồ sơ của tôi bỏ trường `twoFactorEnabled`.
- Bỏ công cụ chạy tay đặt lại lớp thứ hai (`cli:reset-2fa`); công cụ tạo master không nhắc thiết lập lớp thứ hai.
- Xoá dữ liệu lớp thứ hai trong DB: bí mật ứng dụng tạo mã (đã mã hoá), mốc bật, mốc phiên đã qua lớp thứ hai. Bí mật
  bị xoá hẳn, không giữ lại để bật lại sau.
- Bỏ thư viện tạo / kiểm mã `otplib`. Khoá `SECRETS_ENCRYPTION_KEY` vẫn giữ — số giấy tờ tuỳ thân và mã xác nhận trên
  đường gửi thư còn dùng nó.
- TK 5 (master, staff, quyền treo), TK 27 cam kết 28, TK 30 (định danh) bỏ câu về đăng nhập hai lớp — sửa trong cùng
  lượt code.

**Cố ý không làm**:

- Không thêm lớp bảo vệ thay thế (mã qua email, khoá theo IP, thiết bị tin cậy) — người dùng chốt chỉ mật khẩu.
- Không đổi trần 3 phiên của master và staff: trần đó độc lập với lớp thứ hai và vẫn giữ.
- Không sửa `ghim-app` (bỏ `TwoFactorGate`, ô nhập mã ở màn đăng nhập, sinh lại SDK) — việc của repo app, ghi ở mục
  Impact.

## Capabilities

### New Capabilities

_(không có)_

### Modified Capabilities

- `identity/sessions`: bỏ requirement "Đăng nhập hai lớp cho master và staff"; thêm requirement bàn vận hành chỉ đòi
  phiên đăng nhập hợp lệ.
- `identity/email-change`: "Xin đổi email phải nhập lại mật khẩu" thay bằng "Xin đổi email chỉ đòi mật khẩu hiện tại"
  (bỏ scenario thiếu mã lớp thứ hai — OpenSpec không bỏ được scenario trong MODIFIED nên REMOVED + ADDED).
- `platform/master-accounts`: "Đúng một master" thay bằng "Hệ thống chỉ có một master" (bỏ câu và scenario đặt lại lớp
  thứ hai; cùng lý do REMOVED + ADDED).
- `platform/staff-permissions`: scenario "Quyền treo vẫn là quyền staff với đăng nhập" chỉ còn trần 3 phiên.
- `review/queues`: "Quyền master với việc chỉ dùng ở bàn vận hành" bỏ "nơi đòi lớp thứ hai" và "đã qua lớp thứ hai".

## Impact

- **Code** (`identity`, hạ tầng `common/auth`, `group`): cổng `requireSecondFactor` và mọi chỗ gọi (`requireMaster`,
  `requireOps`, master làm thay chủ nhóm); `Actor.secondFactorAt`; luồng đăng nhập mật khẩu và Google; xin đổi email;
  thiết lập lớp thứ hai trong `account.service`; `resetTwoFactor` trong `ops.service`; CLI `reset-two-factor`; dọn dữ
  liệu khi ẩn danh tài khoản; schema Zod.
- **API**: bỏ `POST /me/two-factor/setup`, `POST /me/two-factor/confirm`; bỏ `twoFactorEnabled` khỏi hồ sơ; `totpCode`
  bỏ khỏi body đăng nhập và xin đổi email (gửi kèm vẫn được, bị bỏ qua). Mã lỗi bỏ `TWO_FACTOR_REQUIRED`,
  `TWO_FACTOR_ENABLED`.
- **Migration**: xoá cột `accounts.totp_secret_enc`, `accounts.totp_enabled_at`, `sessions.second_factor_at` — **mất
  dữ liệu có chủ ý**. Production (Render) đang có đúng một master chưa bật hai lớp, nên thực tế không mất gì.
- **Phụ thuộc**: gỡ `otplib` khỏi `package.json`.
- **Tài liệu**: TK 5, 27, 30; CLAUDE.md (thư viện, cây `cli/`), README (bảng lệnh, bước tạo master), `tests/README.md`,
  `docs/review.md`, `.env.*.example` (chú thích `SECRETS_ENCRYPTION_KEY`).
- **Client** `ghim-app`: bỏ `TwoFactorGate` ở `app/ops/_layout.tsx`, ô mã ở `app/login.tsx`, hàm gọi hai route đã bỏ,
  rồi `npm run api:sync` — làm ở repo app sau khi server deploy.
