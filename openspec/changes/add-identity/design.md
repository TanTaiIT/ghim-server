# Design

## Context

Repo mới có hạ tầng HTTP (Fastify, Zod, vỏ response, `errorHandler`, swagger) và module `health`; chưa có
model Prisma, chưa có migration, chưa có xác thực. `add-identity` là change đầu tiên tạo bảng, nên nó đồng
thời đặt nền cho mọi module sau: cách đăng nhập, cách ghi sự kiện chéo module, cách chạy việc nền, cách
test có và không có DB. Động lực và phạm vi ở `proposal.md`; hành vi ở `specs/identity/*`.

Ràng buộc có sẵn (CLAUDE.md): tầng `route → service → repository → Prisma` ghép bằng factory; service
không thấy `request` và không import Prisma; mọi lỗi là `AppError`; trạng thái là `enum` Prisma + tuple
`as const`; mọi con số đọc từ bảng con số có phiên bản (`platform`, chưa có — xem Quyết định 14); dấu băm
email là HMAC với khoá ngoài DB; không log mật khẩu, token, mã xác nhận, email đầy đủ, dấu thiết bị.

Hạ tầng đã chốt và đã cài: `pg-boss`, `nodemailer` + Mailpit, `google-auth-library`, `otplib`,
`@fastify/jwt`, `@fastify/cookie`, `argon2`. DeviceCheck hoãn. Postgres 18 có sẵn `uuidv7()`.

## Goals / Non-Goals

**Goals:**

- Toàn bộ 8 capability của `identity` chạy được và có test ở đúng tầng: calc thuần (unit), service với
  repository giả (unit), ràng buộc DB (test DB), HTTP qua `app.inject()` với repository giả (unit).
- Đặt ba nền dùng chung mà đợt 1 cần ngay: guard đăng nhập cho mọi module, bảng outbox + hàm ghi sự kiện
  trong cùng transaction, pg-boss với việc theo lịch đầu tiên.
- Migration đầu tiên của dự án: SQL đọc được, ràng buộc nằm trong DB chứ không chỉ trong service.

**Non-Goals:**

- Bàn vận hành web, giao diện app: change này chỉ có API.
- Dispatcher đọc outbox và phát cho bên nghe (`ops`, đợt 7). Change này chỉ ghi dòng outbox.
- Mọi hệ quả của khoá, xoá, đánh dấu lên tin đăng, nhóm, nhắn tin, mức tin cậy — đã liệt kê ở proposal.
- Ảnh đại diện và ảnh giấy tờ: cột giữ chỗ có ngay, nhưng tải ảnh thuộc `add-media`.
- Lệnh tạo master, trần hai master, quyền staff thật: thuộc `add-platform-roles`. Change này chỉ có cột
  `role` và điểm nối để hỏi quyền (Quyết định 3).
- Tự xoá hẳn sau 90 ngày, xoá dấu thiết bị sau 180 ngày: `add-data-retention`. Change này chỉ ghi
  `deleted_at` và giữ dòng.

## Decisions

### 1. Một module `identity`, tách file theo mối quan tâm, giữ bốn file chuẩn làm bề mặt

`identity` gánh 8 capability với khoảng 25 route; nhét tất cả vào năm file chuẩn là mỗi file 1.500 dòng.
Giữ `identity.routes.ts` (chỉ đăng ký các plugin con), `identity.service.ts` (factory ghép các service
con), `identity.repository.ts`, `identity.schema.ts`; bên trong tách theo mối quan tâm:
`identity.auth.routes.ts`, `identity.me.routes.ts`, `identity.ops.routes.ts`, `identity.jobs.ts`, và các
calc thuần `email.calc.ts`, `password.calc.ts`, `device.calc.ts`, `lookup-code.calc.ts`. Mẫu
`<module>.<mối quan tâm>.routes.ts` ghi vào CLAUDE.md trong cùng change (luật tasks).

_Thay thế đã cân nhắc:_ tách thành nhiều module (`auth`, `account`, `device`) — bị loại vì TK 30 và CLAUDE.md
đặt tên capability theo module `identity/...`, và ba thứ đó cùng ghi vào một bảng `accounts`.

### 2. Dùng chung cho mọi module: guard đăng nhập ở `src/common/auth/`

Plugin `auth.plugin.ts` decorate `app.authenticate` (đọc Bearer, verify JWT, tra phiên, tra trạng thái tài
khoản), `app.requireVerifiedEmail` (403 `EMAIL_NOT_VERIFIED`, dành cho `add-listings`), `app.requireMaster`,
`app.requireOps(scope)` (master luôn qua; người khác hỏi `PrivilegeSource`). Request mang
`request.actor = { accountId, role, sessionId, secondFactorAt }`. Đặt ở `common` chứ không trong module vì mọi
module sau đều cần, còn dữ liệu nó đọc vẫn đi qua service của `identity`.

### 3. Vai `master` là cột của `accounts`; quyền staff hỏi qua một cổng

`accounts.role` enum `user | master` do `identity` sở hữu: `sessions` phải biết ai là master để áp hai lớp và
3 phiên ngay trong change này. Quyền staff là dữ liệu của `platform` (chưa có), nên `identity` khai một interface
`PrivilegeSource { hasStaffScope(accountId, scope) }` và dùng bản mặc định chỉ trả `true` cho master.
`add-platform-roles` thay bản mặc định bằng bản đọc bảng quyền của nó. Scenario "staff có việc hỗ trợ" trong
change này kiểm bằng `PrivilegeSource` giả trong test; chạy thật từ khi `platform` nối vào.

_Thay thế đã cân nhắc:_ cột `is_staff` trên `accounts` do platform ghi — vi phạm luật 11 (module khác ghi
bảng của `identity`).

### 4. Phiên có trạng thái trong DB; access token ngắn chỉ là giấy thông hành

Mỗi lần đăng nhập là một dòng `sessions`. Access token là JWT 15 phút (giá trị khởi đầu) chứa `sid`; refresh
token là 32 byte ngẫu nhiên, DB chỉ giữ SHA-256 của nó, xoay mỗi lần refresh (token cũ dùng lại → thu hồi cả
phiên). **Mọi request có đăng nhập đều tra `sessions` theo `sid`** (một lượt tìm theo khoá chính) để thu hồi
có hiệu lực ngay như spec đòi (`SESSION_REVOKED` ngay sau khi bị đẩy ra, đăng xuất, đổi mật khẩu, bị khoá).
Hết hạn trượt: `expires_at = last_active_at + 30 ngày`, cập nhật `last_active_at` khi refresh.

App giữ hai token trong kho an toàn của hệ điều hành và gửi Bearer; bàn vận hành web nhận refresh token qua
cookie `httpOnly; Secure; SameSite=Strict` (vì vậy CORS phải là danh sách origin cụ thể). Cùng một endpoint
`/auth/refresh` đọc refresh token từ body hoặc cookie.

_Thay thế đã cân nhắc:_ JWT không trạng thái với danh sách đen — thu hồi trễ tới 15 phút, trái spec; thêm
Redis chỉ để thu hồi — thêm một hạ tầng cho một lượt tìm theo khoá chính.

### 5. Email: một hàm chuẩn hoá, ba cột

`email` (như người dùng gõ, để gửi thư), `email_normalized` (unique — luật mỗi email một tài khoản), `email_hash`
(HMAC-SHA256 với `IDENTITY_HASH_KEY`, để `add-strikes` nối gậy qua lần đăng ký lại và `add-data-retention`
giữ 2 năm sau khi dòng tài khoản bị xoá hẳn). Chuẩn hoá đúng theo spec `registration`; là hàm thuần trong
`email.calc.ts`, dùng ở mọi chỗ so trùng.

Tài khoản đã xoá giữ dòng 90 ngày với `status = deleted`, nên unique trên `email_normalized` tự chặn đăng ký lại;
service tra thấy dòng `deleted` thì trả `EMAIL_PENDING_DELETION` kèm `deleted_at + 90 ngày`.

### 6. Mã xác nhận: băm, một mã sống mỗi mục đích, cùng luật cho ba mục đích

Bảng `verification_codes` dùng cho xác nhận email, đặt lại mật khẩu, đổi email (`purpose`). Mã 6 chữ số, DB chỉ
giữ HMAC của mã. Partial unique `(account_id, purpose) WHERE consumed_at IS NULL` để mỗi mục đích chỉ có một mã
sống; xin mã mới = đánh dấu `consumed_at` cho mã cũ rồi tạo mã mới trong cùng transaction. Cooldown 60 giây so
theo `created_at` của mã sống gần nhất. Quên mật khẩu với email không có tài khoản: trả 200 và không làm gì.

Gửi thư đi qua việc pg-boss `identity.send-mail` (thử lại 3 lần, lùi dần) chứ không gửi trong request: SMTP
chậm hay chết không làm đăng ký trả 500, và test HTTP không cần SMTP. `Mailer` là interface ở `src/lib/mailer.ts`
với hai bản: `nodemailer` qua `SMTP_URL`, và bản giả ghi vào mảng cho test.

### 7. Mật khẩu: argon2id, luật đọc được, danh sách phổ biến nạp một lần

`argon2.hash` với tham số mặc định của thư viện (argon2id). `password.calc.ts` kiểm độ dài 8–128 và tra `Set`
nạp từ `data/common-passwords.txt` (10.000 mật khẩu phổ biến nhất, SecLists) lúc khởi động. Tài khoản chỉ có
Google (`password_hash` null) đặt được mật khẩu qua luồng quên mật khẩu. Đổi hay đặt lại mật khẩu ghi
`password_changed_at` và thu hồi phiên theo spec (đổi: giữ phiên hiện tại; đặt lại: thu hồi hết).

### 8. Google: chỉ verify ID token

App lấy ID token từ Google SDK và gửi lên; server `verifyIdToken` với `GOOGLE_CLIENT_IDS` (nhiều client id, iOS
và Android). Lấy `sub`, `email`, `email_verified`. `google_sub` unique. Email trùng (sau chuẩn hoá) một tài
khoản đã có và Google báo `email_verified = true` thì nối `google_sub` vào tài khoản đó rồi đăng nhập — đúng
spec "vào chính tài khoản ấy". Không có OAuth redirect phía server.

### 9. Hai lớp TOTP: bí mật mã hoá, hiệu lực theo phiên

`totp_secret_enc` mã hoá AES-256-GCM bằng `SECRETS_ENCRYPTION_KEY`; `totp_enabled_at` đánh dấu đã thiết lập
(thiết lập = sinh bí mật → trả URI `otpauth://` → xác nhận bằng mã đầu tiên). Đăng nhập của tài khoản có quyền
(master, hoặc `PrivilegeSource` nói có quyền staff) khi đã bật hai lớp thì **cùng request** phải có `totpCode`;
sai → 401 `INVALID_CREDENTIALS`, không tạo phiên. Phiên ghi `second_factor_at`; `requireOps` từ chối phiên
không có nó với 403 `TWO_FACTOR_REQUIRED` — kể cả khi tài khoản chưa thiết lập (đúng scenario "chưa thiết lập
lớp thứ hai"). Thiết lập hai lớp là route duy nhất của bàn vận hành không đòi `second_factor_at`.

### 10. Dấu thiết bị: băm, đếm theo lượt đăng tin, đánh dấu tính lại bằng hàm thuần

App gửi `x-device-id` (mã ổn định theo nền tảng); server chỉ giữ `device_hash = HMAC(IDENTITY_HASH_KEY, id)`.
Bảng `device_posts (device_hash, account_id, first_posted_at, last_posted_at)`. `identity.service` lộ
`recordListingSubmission(accountId, deviceId, at)`; `add-listings` gọi nó khi gửi tin — change này có service và
test, chưa có route nào gọi vì chưa có tin.

`device.calc.ts` là hàm thuần: vào là các dòng `device_posts` của máy, danh sách tài khoản đang bị khoá trên máy
kèm `locked_at`, các dòng `device_clearances`; ra là tập đánh dấu phải có cho tài khoản vừa gửi tin. Luật: chỉ
tính tài khoản có `last_posted_at` trong 90 ngày; xếp theo `first_posted_at`; ba chỗ đầu không đánh dấu; tài
khoản `first_posted_at` sau `locked_at` của một tài khoản bị khoá trên cùng máy mang đánh dấu
`device_of_locked_account` tới khi tài khoản kia mở khoá; `device_clearances (device_hash, account_id,
cleared_at)` bỏ qua các tài khoản có `first_posted_at < cleared_at` khi tính cho tài khoản được xác nhận. Service
so tập đánh dấu phải có với tập đang mở rồi tạo hoặc đóng dòng `account_flags`.

Mỗi dòng `account_flags` sinh `lookup_code` lúc tạo: 8 ký tự Crockford base32 từ 5 byte ngẫu nhiên (không có
I, L, O, U), unique. Response cho chính người bị đánh dấu không bao giờ có cột nào của bảng này; response cho
hỗ trợ có `kind` và tài khoản, không có `device_hash`.

### 11. Email dùng một lần: bảng có nguồn, so theo đuôi miền, cập nhật không đè tay

`disposable_domains (domain PK, source seed|manual, added_at, removed_at, removed_by)`. So khớp: tách miền sau
`@`, kiểm chính nó và mọi hậu tố (`mx.tempmail.example` → `mx.tempmail.example`, `tempmail.example`, `example`);
dòng có `removed_at` không chặn. Master thêm → `source = manual`; master bỏ → đặt `removed_at` (bia mộ) chứ không
xoá, để lượt cập nhật không hồi sinh. Việc pg-boss `identity.refresh-disposable-domains` hằng tuần tải
`DISPOSABLE_DOMAINS_URL` (mặc định `domains.txt` của dự án `disposable-email-domains`), `INSERT … ON CONFLICT DO
NOTHING` theo lô; tải lỗi hay nội dung rỗng → ghi cảnh báo, không đụng bảng. Hạt giống ban đầu nạp từ
`data/disposable-domains.seed.txt` trong repo khi bảng rỗng (idempotent, chạy lúc khởi động).

### 12. Khoá, xoá, hồ sơ

- Khoá: `status = locked`, `locked_reason`, `locked_at`, `locked_by`; thu hồi mọi phiên trong cùng transaction;
  ghi outbox `identity.account.locked`. Đăng nhập đúng mật khẩu khi bị khoá → 403 `ACCOUNT_LOCKED` kèm lý do;
  sai mật khẩu → 401 như mọi tài khoản. Mở khoá → `active`, ghi `identity.account.unlocked`; đánh dấu
  `device_of_locked_account` liên quan được đóng ngay trong `identity`.
- Xoá: `status = deleted`, `deleted_at`, thu hồi phiên, hồ sơ 404, ghi `identity.account.deleted`. Chặn khi
  `locked` (409 `ACCOUNT_DELETE_BLOCKED`). Kênh không cần đăng nhập `POST /auth/deletion-requests` nhận email +
  mật khẩu: đúng mật khẩu mà tài khoản đang khoá → 409 kèm lý do; tài khoản bình thường → xoá như `DELETE /me`.
  Xoá hẳn sau 90 ngày là việc của `add-data-retention`.
- Hồ sơ công khai `GET /users/:id`: tên hiển thị, `avatar_url`, ngày tham gia, số điện thoại dạng
  `{ number, verified: false }` nếu có; không email. Tài khoản `deleted` → 404; tài khoản `locked` vẫn có hồ sơ
  (TK chỉ ẩn tin). Tên hiển thị 2–40 ký tự, so với danh sách tên dành riêng sau khi bỏ dấu và chữ hoa.

### 13. Outbox: tạo bảng và hàm ghi ngay từ change này

Luật 12 đòi tác động chéo đi qua outbox trong cùng transaction, và `identity` đã có ba sự kiện mà `listing`,
`platform`, `messaging` sẽ nghe (khoá, mở khoá, xoá). Tạo `outbox_events` và `appendEvent(tx, type, payload)`
ở `src/common/outbox/` ngay; dispatcher đọc và phát vẫn thuộc `ops` (đợt 7). Bảng thuộc hạ tầng dùng chung
như `_prisma_migrations`, không module nghiệp vụ nào sở hữu; CLAUDE.md luật 12 cập nhật "(chưa có)" thành
"bảng và hàm ghi đã có, dispatcher chưa".

_Thay thế đã cân nhắc:_ dùng pg-boss làm outbox — không ghi chung transaction được với Prisma qua driver
adapter; để tới `ops` mới tạo bảng — khi đó phải đi sửa lại mọi service đã ghi.

### 14. Con số: đọc qua một hàm `config.get(key)` với giá trị khởi đầu trong code

Bảng con số có phiên bản thuộc `platform`. Để không hardcode rải rác và không chờ `platform`, `identity` đọc mọi
con số qua `src/common/config/runtime-config.ts` **(mới)**: interface `RuntimeConfig.get('identity.codeTtlMinutes')`
với bản mặc định trả giá trị TK 28; `add-platform-roles` thay bằng bản đọc bảng phiên bản. Test dựng bản giả.

### 15. Test không cần DB qua `buildApp({ deps })`

`buildApp` nhận `deps` tuỳ chọn (repository, mailer, jobs, privilegeSource, runtimeConfig, clock); mặc định là
bản thật. Test HTTP qua `app.inject()` truyền repository giả trong bộ nhớ cùng hình dạng, nên `pnpm test` vẫn không
chạm DB. Ràng buộc chỉ DB trả lời được (unique, partial unique, CHECK) kiểm trong `identity.db.test.ts`.

### 16. Việc nền bằng pg-boss, một chỗ khởi động

`src/lib/jobs.ts` giữ một instance pg-boss (schema `pgboss`, chuỗi kết nối `DATABASE_URL`); `server.ts` gọi
`start()` sau khi app dựng và `stop()` khi tắt. Mỗi module khai việc của mình trong `<module>.jobs.ts` với tên
`<module>.<việc>` và `singletonKey` để không chạy chồng. Việc theo lịch của change này: dọn đăng ký dở dang
(hằng ngày), dọn mã xác nhận và phiên hết hạn (hằng ngày), cập nhật miền dùng một lần (hằng tuần), gửi thư
(theo sự kiện). Handler là hàm thuần nhận deps, test gọi thẳng handler.

### 17. Rate limit riêng cho route nhạy cảm

`register`, `login`, `verify-email`, `resend-code`, `forgot-password`, `reset-password`, `google`: 10 lượt mỗi
phút mỗi IP (giá trị khởi đầu) bằng `config.rateLimit` của `@fastify/rate-limit`, tắt khi `NODE_ENV=test` như
rate limit chung. Không thêm luật khoá đăng nhập theo tài khoản: spec không có và nó dễ thành vũ khí khoá
người khác.

### 18. Biến môi trường mới

`JWT_SECRET` (≥ 32 ký tự), `IDENTITY_HASH_KEY` (≥ 32), `SECRETS_ENCRYPTION_KEY` (32 byte base64),
`SMTP_URL`, `MAIL_FROM`, `GOOGLE_CLIENT_IDS` (danh sách, phẩy), `DISPOSABLE_DOMAINS_URL` (có mặc định). Khai ở
`env.ts`, hai file `.env.*.example`, `vitest.config.ts`; CI thêm giá trị giả cho job `db`.

### Dữ liệu — mọi bảng thuộc `identity` trừ `outbox_events`

Quy ước chung: `id uuid @default(dbgenerated("uuidv7()"))`, thời điểm `@db.Timestamptz(3)`, tên bảng và cột
snake_case qua `@map`.

| Bảng                 | Cột chính                                                                                                                                                                                                                                                                                                                                                                                                                                | Index / ràng buộc                                                                                                                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`           | `email`, `email_normalized`, `email_hash`, `password_hash?`, `google_sub?`, `status` enum `account_status` (`pending_verification`, `active`, `locked`, `deleted`), `role` enum `account_role` (`user`, `master`), `display_name`, `avatar_url?`, `phone?`, `totp_secret_enc?`, `totp_enabled_at?`, `locked_reason?`, `locked_at?`, `locked_by?`, `deleted_at?`, `email_changed_at?`, `password_changed_at?`, `created_at`, `updated_at` | unique `email_normalized`; unique `google_sub`; index `email_hash`; index `(status, created_at)` (dọn dở dang); index `(status, deleted_at)` (xoá hẳn). CHECK tay: `password_hash IS NOT NULL OR google_sub IS NOT NULL`; `(status = 'locked') = (locked_at IS NOT NULL)`; `(status = 'deleted') = (deleted_at IS NOT NULL)` |
| `verification_codes` | `account_id`, `purpose` enum `code_purpose` (`email_verify`, `password_reset`, `email_change`), `code_hash`, `target_email?`, `attempts`, `expires_at`, `consumed_at?`, `created_at`                                                                                                                                                                                                                                                     | partial unique `(account_id, purpose) WHERE consumed_at IS NULL`; CHECK tay `attempts >= 0`; CHECK tay `purpose <> 'email_change' OR target_email IS NOT NULL`                                                                                                                                                               |
| `sessions`           | `account_id`, `refresh_token_hash`, `device_name`, `ip?`, `user_agent?`, `second_factor_at?`, `created_at`, `last_active_at`, `expires_at`, `revoked_at?`, `revoke_reason?` enum `session_revoke_reason` (`logout`, `evicted`, `password_changed`, `password_reset`, `revoked_by_user`, `account_locked`, `account_deleted`, `refresh_reuse`)                                                                                            | unique `refresh_token_hash`; index `(account_id, revoked_at, last_active_at)`; CHECK tay `(revoked_at IS NULL) = (revoke_reason IS NULL)`                                                                                                                                                                                    |
| `device_posts`       | `device_hash`, `account_id`, `first_posted_at`, `last_posted_at`                                                                                                                                                                                                                                                                                                                                                                         | PK `(device_hash, account_id)`; index `account_id`; CHECK tay `last_posted_at >= first_posted_at`                                                                                                                                                                                                                            |
| `device_clearances`  | `device_hash`, `account_id`, `cleared_at`, `cleared_by`, `reason`                                                                                                                                                                                                                                                                                                                                                                        | unique `(device_hash, account_id)`                                                                                                                                                                                                                                                                                           |
| `account_flags`      | `account_id`, `kind` enum `account_flag_kind` (`many_accounts_on_device`, `device_of_locked_account`), `device_hash`, `related_account_id?`, `lookup_code`, `created_at`, `cleared_at?`, `cleared_by?`, `cleared_reason?`                                                                                                                                                                                                                | unique `lookup_code`; partial unique `(account_id, kind, device_hash) WHERE cleared_at IS NULL`; index `account_id`; CHECK tay `(cleared_at IS NULL) = (cleared_reason IS NULL)`; CHECK tay `kind <> 'device_of_locked_account' OR related_account_id IS NOT NULL`                                                           |
| `disposable_domains` | `domain` PK, `source` enum `disposable_domain_source` (`seed`, `manual`), `added_at`, `removed_at?`, `removed_by?`                                                                                                                                                                                                                                                                                                                       | partial index `(domain) WHERE removed_at IS NULL`                                                                                                                                                                                                                                                                            |
| `id_verifications`   | `account_id`, `document_type`, `document_number_enc`, `full_name`, `status` enum `id_verification_status` (`pending`, `verified`, `rejected`), `reviewed_by?`, `reviewed_at?`, `reason?`, `created_at`                                                                                                                                                                                                                                   | partial unique `(account_id) WHERE status = 'pending'`; CHECK tay `status <> 'rejected' OR reason IS NOT NULL`                                                                                                                                                                                                               |
| `outbox_events`      | `type`, `payload` jsonb, `created_at`, `published_at?`                                                                                                                                                                                                                                                                                                                                                                                   | partial index `(created_at) WHERE published_at IS NULL`                                                                                                                                                                                                                                                                      |

Mỗi ràng buộc chỉ DB trả lời được (unique, partial unique, CHECK) có một ca trong `identity.db.test.ts` ghi
thẳng bằng Prisma và kiểm DB từ chối (`P2002`, SQLSTATE `23514`).

### Quyết định và chủ sở hữu

| Quyết định                                                                                              | Chủ            | Cách module khác tác động                                         |
| ------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------- |
| Trạng thái tài khoản, vai `master`, phiên, mã                                                           | `identity`     | Gọi service của `identity`                                        |
| Dấu thiết bị, đánh dấu, mã tra cứu, miễn trừ                                                            | `identity`     | `listing` gọi `recordListingSubmission`; `screening` đọc đánh dấu |
| Quyền staff                                                                                             | `platform`     | `identity` hỏi qua `PrivilegeSource`                              |
| Con số vận hành                                                                                         | `platform`     | `identity` đọc qua `RuntimeConfig`                                |
| Sự kiện `identity.account.{verified,locked,unlocked,deleted}`, `identity.device.{flagged,flag_cleared}` | `identity` ghi | Bên nghe đọc outbox qua dispatcher của `ops`                      |

### Mã lỗi mới (tập đóng của change này)

400 `PASSWORD_WEAK`, `EMAIL_DISPOSABLE`, `CODE_INVALID`, `CODE_EXPIRED`, `DISPLAY_NAME_RESERVED` · 401
`INVALID_CREDENTIALS`, `SESSION_REVOKED`, `SESSION_EXPIRED` · 403 `ACCOUNT_LOCKED`, `TWO_FACTOR_REQUIRED`,
`EMAIL_NOT_VERIFIED` · 409 `EMAIL_TAKEN`, `EMAIL_PENDING_DELETION`, `ACCOUNT_DELETE_BLOCKED`, `CONFLICT` · 429
`RESEND_TOO_SOON`, `EMAIL_CHANGE_TOO_SOON`.

### Route (tiền tố `/api/v1`)

- Khách: `POST /auth/register`, `/auth/verify-email`, `/auth/resend-code`, `/auth/google`, `/auth/login`,
  `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/deletion-requests`;
  `GET /users/:id`.
- Đã đăng nhập: `POST /auth/logout`; `GET /me`, `PATCH /me`, `PUT /me/password`, `POST /me/email-change`,
  `POST /me/email-change/confirm`, `GET /me/sessions`, `DELETE /me/sessions/:id`, `DELETE /me/sessions`
  (trừ hiện tại), `DELETE /me`, `POST /me/two-factor/setup`, `POST /me/two-factor/confirm`,
  `POST /me/id-verification`.
- Bàn vận hành (`/ops/...`, `requireOps`): `POST /ops/accounts/:id/lock`, `POST /ops/accounts/:id/unlock`
  (master), `GET /ops/flags/:lookupCode`, `POST /ops/flags/:lookupCode/clear` (việc hỗ trợ),
  `GET|POST|DELETE /ops/disposable-domains` (master), `GET /ops/id-verifications`,
  `POST /ops/id-verifications/:id/decision` (việc duyệt giấy tờ).

## Risks / Trade-offs

- [Mỗi request có đăng nhập tra DB một lần] → Lượt tìm theo khoá chính trên `sessions`, có index; khi cần, thêm
  cache ngắn trong tiến trình mà không đổi hợp đồng.
- [SMTP chết thì không ai nhận được mã] → Gửi qua việc pg-boss có thử lại; người dùng vẫn xin gửi lại sau 60
  giây; Mailpit ở dev nên lỗi cấu hình lộ sớm.
- [Dấu thiết bị do app gửi nên giả được] → Chỉ là tín hiệu để giữ tin cho người (TK 8), không chặn; máy lạm
  dụng bền qua cài lại app chờ DeviceCheck.
- [Danh sách email dùng một lần có miền oan] → Master bỏ được, bia mộ chặn hồi sinh; lỗi báo rõ nên người dùng
  đổi email được ngay.
- [Hai lớp bắt buộc nhưng không có đường khôi phục khi mất ứng dụng tạo mã] → Master đặt lại hai lớp cho staff
  qua bàn vận hành; master mất máy tạo mã thì đội kỹ thuật đặt lại bằng công cụ của `add-platform-roles`.
- [Email dùng Google nhưng người dùng bị mất quyền vào Google] → Luồng quên mật khẩu đặt được mật khẩu cho tài
  khoản chỉ có Google.
- [Tạo `outbox_events` trước khi có dispatcher] → Dòng nằm chờ không hại gì; `ops` chỉ việc đọc. Rủi ro là bảng
  phình nếu đợt 7 trễ; theo dõi bằng số dòng chưa phát trong readiness ở `ops`.
- [`PrivilegeSource` và `RuntimeConfig` mặc định che mất lỗi tích hợp] → Hai bản mặc định ghi rõ "chỉ master" và
  "giá trị khởi đầu"; `add-platform-roles` có task thay bản thật và chạy lại test của `identity`.

## Migration Plan

1. `pnpm exec prisma migrate dev --create-only --name init_identity`, đọc SQL, bổ sung các CHECK viết tay ở
   bảng trên cùng file, rồi `pnpm db:migrate`. Partial unique và partial index khai ngay trong schema
   (`partialIndexes`). Không mất dữ liệu: DB chưa có bảng nào.
2. Env mới phải có mặt trước khi khởi động (`env.ts` fail fast). Dev: chép từ `.env.development.example`
   và chạy `pnpm mail:up`.
3. Khởi động: pg-boss tạo schema `pgboss`; `identity` nạp hạt giống miền dùng một lần nếu bảng rỗng; đăng ký
   việc theo lịch.
4. Lùi: chưa có production; lùi là `migrate reset` trên DB dev.

## Open Questions

- Tên thiết bị mặc định khi app không gửi `x-device-name`: dùng chuỗi rút từ `user-agent` hay "Thiết bị
  không tên". Không đổi spec hay task; chốt lúc viết `sessions`.
- Nội dung thư (tiêu đề, câu chữ) cho ba loại mã: viết lúc làm `Mailer`, không ảnh hưởng hành vi.
