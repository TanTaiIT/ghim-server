# Design

## Context

Lớp thứ hai (TOTP) được dựng ở `add-identity` và `add-platform-roles` (10/10/2026), siết ở `fix-audit-security` (không
thiết lập lại qua app) và `fix-audit-identity` (đổi email đòi mã). Hiện nó chạm:

- **Cổng**: `requireSecondFactor(actor)` trong `common/auth/auth.plugin.ts`, gọi từ `requireMaster`, `assertOps` (dùng
  cho `requireOps` và `requireCategoryOps`), và `group.shared.context` khi master làm thay chủ nhóm. Nó đọc
  `Actor.secondFactorAt`, lấy từ `sessions.second_factor_at` qua `identity.shared.resolveActor`.
- **Ghi mốc phiên**: `auth.service.login` (mật khẩu + mã) và `account.service.confirmTwoFactor` (phiên đang dùng).
  `loginWithGoogle` mở phiên với mốc `null` và chặn tài khoản có quyền đã bật hai lớp.
- **Thiết lập / đặt lại**: `account.service.setupTwoFactor`, `confirmTwoFactor`; `ops.service.resetTwoFactor` + CLI
  `src/cli/reset-two-factor.ts` + script `cli:reset-2fa`.
- **Đổi email**: `account.service.requestEmailChange` đòi `totpCode` khi đã bật.
- **Dữ liệu**: `accounts.totp_secret_enc` (AES-256-GCM qua `secrets.seal`), `accounts.totp_enabled_at`,
  `sessions.second_factor_at`. Ẩn danh tài khoản (`identity.repository`) đặt hai cột đầu về `null`.
- **Hợp đồng**: `loginBodySchema.totpCode`, `emailChangeBodySchema.totpCode`, `twoFactorSetupSchema`,
  `twoFactorConfirmBodySchema`, `meSchema.twoFactorEnabled`; route `POST /me/two-factor/setup`, `/confirm`.
- **Thư viện**: `otplib` chỉ dùng ở `identity.shared` (`verify`) và `account.service` (`generateSecret`, `generateURI`).

Production (Render) có đúng một master, `totp_enabled_at` null — không ai đang dùng lớp thứ hai.

## Goals / Non-Goals

**Goals**

- Gỡ hẳn lớp thứ hai: không cổng, không route, không cột, không thư viện, không nhánh chết.
- Client cũ không vỡ ở chỗ không cần vỡ: body còn `totpCode` vẫn được nhận.
- Giữ nguyên mọi thứ không thuộc lớp thứ hai: trần 3 phiên của tài khoản có quyền, khoá tài khoản, quyền treo, phạm
  vi staff, `SECRETS_ENCRYPTION_KEY`.

**Non-Goals**

- Lớp bảo vệ thay thế (mã qua email, thiết bị tin cậy) — người dùng đã chốt không làm.
- Sửa `ghim-app`.

## Decisions

### 1. Xoá cổng, không để cờ tắt

`requireSecondFactor` bị xoá; `requireMaster` chỉ còn kiểm vai, `assertOps` chỉ còn kiểm quyền treo và phạm vi;
`group.shared.context` bỏ dòng gọi cổng. `Actor` bỏ `secondFactorAt`.

Phương án "giữ code, tắt bằng cấu hình" bị loại: người dùng chọn gỡ hẳn, và một cờ tắt để lại hai nhánh phải test cùng
ba cột không ai ghi.

### 2. `totpCode` rời schema, body cũ vẫn hợp lệ

Bỏ `totpCode` khỏi `loginBodySchema` và `emailChangeBodySchema`. Hai schema là `z.object` (không `.strict()`), nên Zod
bỏ khoá thừa: client cũ gửi `totpCode` vẫn nhận 200, mã bị bỏ qua (scenario "Client cũ vẫn gửi mã lúc đăng nhập"). Không
đổi hai schema sang `.strict()` trong change này.

### 3. Hai route thiết lập biến mất hẳn

Xoá route khỏi `me.routes.ts`, không để route trả 410. Lý do: dự án chưa có client phát hành nào phụ thuộc; 404
`NOT_FOUND` từ `setNotFoundHandler` đủ rõ, và tài liệu OpenAPI tự mất hai route. Mã lỗi `TWO_FACTOR_REQUIRED`,
`TWO_FACTOR_ENABLED` không còn chỗ ném.

### 4. Đăng nhập Google mở cho tài khoản có quyền

Nhánh chặn trong `loginWithGoogle` tồn tại chỉ vì Google không có chỗ nhập mã. Không còn mã thì nhánh không còn lý do;
xoá. `openSession` bỏ tham số `secondFactorAt`, giữ `privileged` (trần phiên). Chú thích "Người gọi đã hỏi lúc kiểm lớp
thứ hai" sửa thành lý do thật: hỏi một lần cho trần phiên.

### 5. Đổi email chỉ đòi mật khẩu

`requestEmailChange` bỏ khối kiểm `totpCode`; mọi phần còn lại (mật khẩu, `PASSWORD_NOT_SET`, báo email cũ, thu phiên
khác) giữ nguyên.

### 6. Bỏ `resetTwoFactor` và CLI của nó

Xoá `ops.service.resetTwoFactor`, khai báo trong `IdentityService`, `src/cli/reset-two-factor.ts`, script
`cli:reset-2fa`. `create-master` bỏ câu nhắc thiết lập lớp thứ hai trong thông báo. `cli-identity.ts` sửa chú thích
(chỉ còn tạo master).

### 7. Migration: xoá ba cột, mất dữ liệu có chủ ý

Module sở hữu: `identity` (cả `accounts` lẫn `sessions`).

| Bảng       | Cột                | Kiểu          | Hành động |
| ---------- | ------------------ | ------------- | --------- |
| `accounts` | `totp_secret_enc`  | `text` null   | DROP      |
| `accounts` | `totp_enabled_at`  | `timestamptz` | DROP      |
| `sessions` | `second_factor_at` | `timestamptz` | DROP      |

- Không index, CHECK, partial unique hay trigger nào nhắc ba cột này (đã dò `prisma/migrations/**`) — không có SQL viết
  tay đi kèm, migration do Prisma sinh: ba câu `ALTER TABLE … DROP COLUMN`.
- Mất dữ liệu: bí mật TOTP đã mã hoá và hai mốc thời gian. Có chủ ý — bí mật không còn chỗ dùng, giữ lại chỉ là dữ liệu
  nhạy cảm vô chủ (TK 31: dữ liệu cá nhân có hạn lưu). Không phải đổi tên nên không viết lại bằng `RENAME`.
- Thứ tự deploy an toàn: code mới không đọc ba cột, nên chạy migration trước hay sau lúc đổi bản đều được; Render chạy
  migrate trước khi bản mới nhận traffic. Bản cũ còn chạy trong lúc migrate sẽ lỗi khi chọn cột đã mất — cửa sổ này đã
  có ở mọi migration của dự án, chấp nhận.
- `identity.repository`: bỏ hai cột khỏi kiểu cập nhật tài khoản và khỏi lượt ẩn danh; bỏ `secondFactorAt` khỏi kiểu
  mở phiên, kiểu phiên và câu SQL `findActorSession`.
- `pnpm db:drift` phải ra "No difference detected".

### 8. Gỡ `otplib`

`pnpm remove otplib`. Hằng `TOTP_ISSUER`, `TOTP_EPOCH_TOLERANCE`, hàm `totpMatches` trong `identity.shared` xoá theo.
`secrets.seal/open` giữ — `id-verification` và hàng gửi mã còn dùng; chú thích ở `common/crypto/secrets.ts`,
`identity.service.ts`, `config/env.ts`, `.env.*.example` bỏ chữ "TOTP".

### 9. Test

- Xoá `tests/two-factor.http.test.ts`.
- `tests/auth.http.test.ts`: ca "phiên chưa qua lớp thứ hai → 403 `TWO_FACTOR_REQUIRED`" đổi thành ca dương — staff
  đúng phạm vi, phiên mở bằng mật khẩu, gọi được bàn vận hành; giữ ca ngoài phạm vi → 403 `FORBIDDEN`.
- Helper (`ops-helpers.ts`, `group-helpers.ts`…) và các test dựng `Actor`/phiên với `secondFactorAt` bỏ trường đó —
  thay đổi cơ học do TypeScript chỉ ra.
- Ca mới theo scenario: master đăng nhập mật khẩu không mã rồi gọi bàn vận hành; staff đăng nhập Google; body đăng
  nhập có `totpCode` vẫn 200; hai route cũ → 404 `NOT_FOUND`; staff đổi email chỉ với mật khẩu; master vừa tạo dùng bàn
  vận hành ngay; quyền treo mở khoá vẫn chịu trần 3 phiên; master xử việc của nhóm ở bàn vận hành.
- Test DB của repository: bỏ trường đã xoá, không cần ca DB mới (không thêm ràng buộc).

## Risks / Trade-offs

- **Bàn vận hành chỉ còn mật khẩu** → lộ mật khẩu master là lộ toàn bộ quyền vận hành. Giảm thiểu bằng lớp đã có: trần
  3 phiên (phiên lạ đẩy phiên cũ ra, chủ tài khoản thấy ở `GET /me/sessions`), đổi mật khẩu thu hồi mọi phiên khác,
  giới hạn tần suất đăng nhập, nhật ký audit. Người dùng chấp nhận rủi ro ngày 23/10/2026.
- **Đăng nhập Google cho tài khoản có quyền** → an toàn của bàn vận hành phụ thuộc thêm vào tài khoản Google. Chấp nhận
  cùng quyết định trên.
- **Không đường lui dữ liệu** → bật lại lớp thứ hai sau này là một change mới, mọi người thiết lập lại từ đầu. Hiện
  không ai có bí mật, nên không mất gì thật.
- **App cũ** còn `TwoFactorGate` sẽ không bao giờ gặp `TWO_FACTOR_REQUIRED` nên không chặn; màn thiết lập gọi route đã
  bỏ thì nhận 404. App phải dọn trước khi phát hành.

## Migration Plan

1. Code + migration trên nhánh, `pnpm run check`, `pnpm run build`, `pnpm db:drift` xanh.
2. Merge → Render chạy `prisma migrate deploy` (pre-deploy hoặc `migrate-and-start.sh` ở gói free).
3. `ghim-app`: `npm run api:sync`, bỏ `TwoFactorGate`, ô mã, hàm gọi route đã bỏ.

Rollback: revert commit code; ba cột đã mất không phục hồi được dữ liệu, nhưng thêm lại cột rỗng bằng migration mới là
đủ cho code cũ chạy (mọi tài khoản như chưa bật lớp thứ hai).

## Open Questions

_(không có — cách gỡ và mức bảo vệ người dùng đã chốt ngày 23/10/2026)_
