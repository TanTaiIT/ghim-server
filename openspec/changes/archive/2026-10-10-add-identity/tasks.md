# Tasks

## 1. Schema và migration đầu tiên

- [x] 1.1 Khai 8 bảng và 7 enum của design vào `prisma/schema.prisma` (uuidv7, Timestamptz(3), @map snake_case, partial unique/index bằng `partialIndexes`); xác minh `pnpm exec prisma format && pnpm exec prisma validate` qua
- [x] 1.2 Sinh migration `init_identity` bằng `migrate dev --create-only`, đọc SQL, thêm các CHECK viết tay của design cùng comment `///` ở model; xác minh `pnpm db:migrate` áp được và `pnpm db:drift` ra "No difference detected"
- [x] 1.3 Viết `tests/identity.db.test.ts` cho mọi ràng buộc chỉ DB trả lời được: unique `email_normalized`, `google_sub`, `refresh_token_hash`, `lookup_code`; partial unique mã sống, đánh dấu mở, hồ sơ chờ duyệt; từng CHECK (`P2002`, SQLSTATE `23514`); xác minh `pnpm test:db` xanh

## 2. Nền dùng chung: env, mailer, việc nền, outbox, con số

- [x] 2.1 Thêm `JWT_SECRET`, `IDENTITY_HASH_KEY`, `SECRETS_ENCRYPTION_KEY`, `SMTP_URL`, `MAIL_FROM`, `GOOGLE_CLIENT_IDS`, `DISPOSABLE_DOMAINS_URL` vào `env.ts`, hai `.env.*.example`, `vitest.config.ts`, `vitest.db.config.ts`, CI; xác minh `tests/env.test.ts` có ca thiếu và ca sai độ dài khoá
- [x] 2.2 Viết `src/lib/mailer.ts`: interface `Mailer`, bản `nodemailer` qua `SMTP_URL`, bản giả ghi mảng; xác minh unit test bản giả và một ca gửi thật tới Mailpit đánh dấu bỏ qua khi không có `SMTP_URL`
- [x] 2.3 Viết `src/lib/jobs.ts` (pg-boss schema `pgboss`, `start`/`stop`, hàm `schedule(name, cron, handler, { singletonKey })`) và nối vào `server.ts`; xác minh `pnpm dev` lên, bảng `pgboss.*` xuất hiện, tắt sạch bằng SIGINT
- [x] 2.4 Tạo bảng `outbox_events` (đã nằm trong 1.1) và `src/common/outbox/outbox.ts` với `appendEvent(tx, type, payload)`; xác minh test DB ghi một sự kiện trong transaction bị rollback thì không còn dòng
- [x] 2.5 Viết `src/common/config/runtime-config.ts`: interface `RuntimeConfig.get(key)` và bản mặc định mang giá trị TK 28 cho `identity` (10 phút, 5 lần, 60 giây, 7 ngày, 20/3 phiên, 30 ngày, 90 ngày, 15 phút token, 10 lượt/phút); xác minh unit test đọc đủ khoá và báo lỗi khoá lạ
- [x] 2.6 Cập nhật CLAUDE.md luật 12 (outbox: bảng và hàm ghi đã có, dispatcher chưa), luật 19 (đọc con số qua `RuntimeConfig`), mục Stack (pg-boss đã nối), cấu trúc thư mục (`common/auth`, `common/outbox`, `common/config`, `lib/mailer`, `lib/jobs`); xác minh `pnpm run format:check` trên CLAUDE.md

## 3. Hàm thuần của identity

- [x] 3.1 `email.calc.ts`: `normalizeEmail`, `hashEmail` (HMAC-SHA256), `domainSuffixes`; xác minh unit test phủ bốn scenario chuẩn hoá của spec `registration` và hậu tố miền
- [x] 3.2 `password.calc.ts`: kiểm 8–128 ký tự, nạp `data/common-passwords.txt` một lần, băm và so argon2id; xác minh unit test cho quá ngắn, quá dài, `12345678`, mật khẩu hợp lệ
- [x] 3.3 `lookup-code.calc.ts` (8 ký tự Crockford base32 từ 5 byte ngẫu nhiên) và `reserved-names.ts` (so sau khi bỏ dấu, chữ hoa); xác minh unit test không sinh I/L/O/U và bắt "quan tri he thong"
- [x] 3.4 `device.calc.ts`: tính tập đánh dấu phải có từ `device_posts`, tài khoản bị khoá trên máy, miễn trừ; xác minh unit test cho mọi scenario của hai requirement đánh dấu và requirement thứ tự chỗ (thứ ba, thứ tư, quá 90 ngày, cũ quay lại, chỗ trống ra, sau khi khoá, người nhà, mở khoá, máy mua lại)
- [x] 3.5 `secrets.ts` trong `src/common/crypto/`: mã hoá/giải mã AES-256-GCM bằng `SECRETS_ENCRYPTION_KEY`, băm token refresh SHA-256; xác minh unit test đi về nguyên vẹn và khoá sai thì giải mã lỗi

## 4. Repository, service khung và guard đăng nhập

- [x] 4.1 `identity.repository.ts` với factory `createIdentityRepository(prisma)` phủ 8 bảng, và bản giả trong bộ nhớ cùng hình dạng ở `tests/fakes/identity-repository.fake.ts`; xác minh unit test bản giả giữ đúng unique và partial unique như DB
- [x] 4.2 `identity.service.ts` factory `createIdentityService(deps)` với deps: repository, mailer (qua việc `identity.send-mail`), jobs, privilegeSource mặc định (chỉ master), runtimeConfig, clock; xác minh service dựng được với toàn bộ deps giả trong một test khung
- [x] 4.3 `src/common/auth/auth.plugin.ts`: `authenticate` (Bearer → JWT → tra phiên → trạng thái tài khoản), `requireVerifiedEmail`, `requireMaster`, `requireOps(scope)` kèm kiểm `second_factor_at`; `buildApp({ deps })` nhận deps giả; xác minh HTTP test: thiếu token 401, phiên bị thu hồi 401 `SESSION_REVOKED`, tài khoản khoá 403 `ACCOUNT_LOCKED`, chưa hai lớp 403 `TWO_FACTOR_REQUIRED`

## 5. Đăng ký, xác nhận email, email dùng một lần

- [x] 5.1 Service và route `POST /auth/register`, `/auth/verify-email`, `/auth/resend-code`: mã băm, một mã sống, cooldown 60 giây, 5 lần sai, 10 phút, chuẩn hoá và trùng email, `EMAIL_PENDING_DELETION`; xác minh HTTP test với repository giả phủ mọi scenario của bốn requirement đầu spec `registration` và requirement đăng ký lại của `account-deletion`
- [x] 5.2 Việc `identity.send-mail` (thử lại 3 lần) và ba mẫu thư; xác minh unit test handler gọi `Mailer` giả đúng người nhận, không log mã
- [x] 5.3 Service miền dùng một lần: so theo đuôi miền, bia mộ, thêm/bỏ của master, nạp hạt giống khi bảng rỗng, việc `identity.refresh-disposable-domains`; route `GET|POST|DELETE /ops/disposable-domains`; xác minh unit test cho 5 scenario của hai requirement email dùng một lần và handler tải lỗi thì không đụng bảng
- [x] 5.4 Việc `identity.purge-unverified` xoá hẳn tài khoản chưa xác nhận quá 7 ngày; xác minh test DB tạo dòng cũ rồi chạy handler thì dòng mất và email đăng ký lại được

## 6. Phiên đăng nhập, mật khẩu, hai lớp

- [x] 6.1 `POST /auth/login`, `/auth/refresh`, `/auth/logout`: phiên trong DB, JWT 15 phút chứa `sid`, refresh xoay và phát hiện dùng lại, cookie cho web, cùng lỗi 401 cho sai email và sai mật khẩu; xác minh HTTP test phủ requirement đăng nhập và đăng xuất
- [x] 6.2 Trần phiên 20/3 với đẩy phiên cũ nhất, hết hạn trượt 30 ngày; xác minh HTTP test với clock giả: thiết bị thứ 21 vào được, thiết bị bị đẩy nhận `SESSION_REVOKED`, quá 30 ngày nhận `SESSION_EXPIRED`
- [x] 6.3 `GET /me/sessions`, `DELETE /me/sessions/:id`, `DELETE /me/sessions`; xác minh HTTP test bốn scenario của requirement xem và thu hồi thiết bị, response không có `refresh_token_hash`
- [x] 6.4 `POST /auth/forgot-password`, `/auth/reset-password`, `PUT /me/password`: cùng luật mã, trả 200 với email lạ, thu hồi phiên theo spec, tài khoản chỉ Google đặt được mật khẩu; xác minh HTTP test năm scenario của hai requirement mật khẩu
- [x] 6.5 Hai lớp: `POST /me/two-factor/setup` (URI otpauth, bí mật mã hoá), `/me/two-factor/confirm`, `totpCode` trong `login` cho tài khoản có quyền, `second_factor_at` trên phiên; xác minh HTTP test ba scenario của requirement hai lớp với `otplib` sinh mã thật và `PrivilegeSource` giả

## 7. Google

- [x] 7.1 `POST /auth/google` với `google-auth-library` sau một interface `GoogleTokenVerifier` (bản giả cho test), nối `google_sub` vào tài khoản trùng email đã xác thực; xác minh HTTP test hai scenario của requirement Google và ca token sai → 401 `INVALID_CREDENTIALS`

## 8. Hồ sơ và đổi email

- [x] 8.1 `GET /users/:id`, `GET /me`, `PATCH /me` (tên hiển thị, số điện thoại không xác thực); xác minh HTTP test năm scenario của spec `profile`, response hồ sơ không có email, `GET /me` của người bị đánh dấu không nhắc thiết bị
- [x] 8.2 `POST /me/email-change`, `/me/email-change/confirm` với mục đích `email_change`, luật trùng và dùng một lần, 1 lần mỗi 30 ngày; xác minh HTTP test bốn scenario của spec `email-change`

## 9. Khoá, mở khoá, xoá tài khoản

- [x] 9.1 `POST /ops/accounts/:id/lock|unlock` (master): lý do bắt buộc, thu hồi phiên, outbox `identity.account.locked|unlocked`, đóng đánh dấu `device_of_locked_account` khi mở khoá; xác minh HTTP test bảy scenario của spec `account-lock` và test DB thấy dòng outbox cùng transaction
- [x] 9.2 `DELETE /me` và `POST /auth/deletion-requests`: `deleted_at`, thu hồi phiên, hồ sơ 404, chặn khi khoá, outbox `identity.account.deleted`; xác minh HTTP test bốn scenario của spec `account-deletion`

## 10. Dấu thiết bị, đánh dấu, mã tra cứu

- [x] 10.1 `recordListingSubmission(accountId, deviceId, at)`: băm thiết bị, upsert `device_posts`, chạy `device.calc`, tạo/đóng `account_flags` kèm `lookup_code`, outbox `identity.device.flagged|flag_cleared`; xác minh unit test với repository giả cho mọi scenario của ba requirement đánh dấu và test DB cho partial unique đánh dấu mở
- [x] 10.2 `GET /ops/flags/:lookupCode`, `POST /ops/flags/:lookupCode/clear` (việc hỗ trợ, lý do bắt buộc, ghi `device_clearances`); xác minh HTTP test bảy scenario của hai requirement hỗ trợ và không lộ mã thiết bị, kể cả staff chỉ có danh mục bị 403
- [x] 10.3 Việc `identity.purge-expired` dọn mã quá hạn và phiên hết hạn hoặc đã thu hồi quá 30 ngày; xác minh test DB handler xoá đúng dòng, giữ dòng còn hạn

## 11. Xác minh giấy tờ

- [x] 11.1 `POST /me/id-verification` (số giấy tờ mã hoá), `GET /ops/id-verifications`, `POST /ops/id-verifications/:id/decision` (việc duyệt giấy tờ, lý do khi từ chối); xác minh HTTP test sáu scenario của spec `id-verification` và hồ sơ công khai không có số giấy tờ

## 12. Tài liệu đi cùng

- [x] 12.1 Cập nhật CLAUDE.md: module `identity` đang có, mẫu tách file `<module>.<mối quan tâm>.routes.ts`, `PrivilegeSource` và `RuntimeConfig` chờ `platform`, mục "(chưa có)" đã có; cập nhật `tests/README.md` và README (biến env, `pnpm mail:up`); xác minh `pnpm run format:check` trên các file đó
- [x] 12.2 Tag Swagger cho `Auth`, `Me`, `Users`, `Ops · Accounts`, `Ops · Flags`, `Ops · Disposable domains`, `Ops · ID verification`; xác minh `/docs` ở dev liệt kê đủ route và `bearerAuth` áp lên route cần đăng nhập

## 13. Kiểm tra tích hợp

- [x] 13.1 `pnpm run check` xanh (typecheck, lint, test, spec:validate)
- [x] 13.2 `pnpm test:db` xanh trên container `postgres-test` và `pnpm db:drift` ra "No difference detected"
- [x] 13.3 `pnpm run build` rồi `pnpm start:local` khởi động được: `/health/ready` trả `database: up`, đăng ký một tài khoản thật qua `/docs` và thấy thư trong Mailpit

## Workflow follow-up

- Archive change sau khi người dùng duyệt kết quả và ba mục kiểm tra tích hợp đều qua (`/opsx:archive add-identity`).
- Sau archive: `pnpm exec prettier --write openspec` rồi `pnpm run spec:validate`.
