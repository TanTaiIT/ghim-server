# Phiên 10/10/2026 — hoàn thành change `add-identity` (đợt 1)

Nhật ký một phiên làm việc với Claude Code: những gì đã làm, theo thứ tự, kèm bằng chứng và các
quyết định tự chốt để người đọc đối chiếu. Nguồn chuẩn vẫn là code, `openspec/specs/identity/*` và
`CLAUDE.md`; file này chỉ là bản đồ để tra lại.

## 1. Trạng thái cuối phiên

| Hạng mục                         | Kết quả                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change OpenSpec                  | `add-identity` 40/40 task, archive thành `openspec/changes/archive/2026-10-10-add-identity`; sinh 8 spec `openspec/specs/identity/*` (37 requirement) |
| Commit trên `main`               | `903ec70` mốc hạ tầng + design/tasks · `bf527ec` `.gitattributes` LF · `e180546` `feat(identity)` (97 file)                                           |
| `pnpm run check`                 | typecheck · oxlint 0 warning · 257 unit test / 31 file (1 skipped: ca gửi SMTP thật, chỉ chạy khi shell có `SMTP_URL`) · spec:validate 24/24          |
| `pnpm test:db` + `db:drift`      | 32 test trên Postgres thật · "No difference detected"                                                                                                 |
| `pnpm run build` + `start:local` | `/health/ready` = `up` · `/docs` 200, 34 route, 8 tag, `bearerAuth` trên mọi route cần đăng nhập                                                      |
| Luồng thật qua API               | đăng ký → Mailpit nhận mã → `verify-email` 200 → `login` trả access + refresh token                                                                   |
| Chưa làm                         | Chưa `git push`. Repo cha `ahaplus-shop-v2` không đụng gì.                                                                                            |

## 2. Việc đã làm, theo thứ tự

### 2.1 Chuẩn bị (trước khi code)

1. Kiểm tra server: `check`, `build`, smoke `/health` xanh; phát hiện `format:check` đỏ 149 file chỉ vì
   CRLF (`core.autocrlf=true`), `openspec` chưa có trên PATH, Docker chưa bật.
2. Commit mốc `903ec70`: hạ tầng chốt 08/10, 4 delta spec, Mailpit trong compose, `design.md` +
   `tasks.md`. Hook `git-contract#5` của repo cha cấm trailer `Co-Authored-By`, nên mọi commit của
   phiên đều không có dòng đó; hook `review-gate` chỉ chấp nhận `[skip-review: …]` nằm trong chính chuỗi
   lệnh (`-m`), không đọc được từ `-F file`.
3. Sửa CRLF một lần: `.gitattributes` `* text=auto eol=lf` + ghi lại working copy. Commit `bf527ec`.
   Bẫy đã gặp: `git checkout-index -a -f` bỏ qua file có stat trùng index (phải `touch` trước), và sau
   đó git vẫn cờ " M" theo cỡ file đổi dù hash trùng (phải `git add -u`).
4. Docker: `postgres` 5435, `postgres-test` 5436, `mailpit` 1025/8025 healthy; `test:db`, `db:drift`
   xanh; readiness `up`.
5. Cài `openspec@1.14.1` global (`C:\nvm4w\nodejs`), `/opsx:*` dùng được.
6. Người dùng duyệt `design.md` và `tasks.md` → bắt đầu `/opsx:apply add-identity`.

### 2.2 Triển khai theo 13 nhóm task

Bảng đối chiếu task → code → test. Đường dẫn trong `src/modules/identity/` viết tắt là `identity/`.

| Task | Việc                                                                  | Code                                                                                             | Test                                                                        |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1.1  | 7 enum + 9 bảng (8 `identity` + `outbox_events`)                      | `prisma/schema.prisma`                                                                           | `tests/identity.db.test.ts`                                                 |
| 1.2  | Migration `init_identity` + 10 CHECK viết tay                         | `prisma/migrations/20261010044146_init_identity/migration.sql`                                   | `pnpm db:drift`                                                             |
| 1.3  | Test từng unique / partial unique / CHECK, cascade phiên              | —                                                                                                | `tests/identity.db.test.ts` (23 ca)                                         |
| 2.1  | 7 biến env identity, ràng buộc production                             | `src/config/env.ts`, `.env.*.example`, `vitest.config.ts`, `vitest.db.config.ts`                 | `tests/env.test.ts`                                                         |
| 2.2  | `Mailer` nodemailer + bản giả                                         | `src/lib/mailer.ts`                                                                              | `tests/mailer.test.ts`                                                      |
| 2.3  | pg-boss: start/stop, `schedule`, `work`, `send`, xếp chờ trước start  | `src/lib/jobs.ts`, `src/server.ts`                                                               | `tests/jobs.db.test.ts`                                                     |
| 2.4  | Outbox cùng transaction                                               | `src/common/outbox/outbox.ts`                                                                    | `tests/outbox.db.test.ts`                                                   |
| 2.5  | `RuntimeConfig` với 15 con số TK 28                                   | `src/common/config/runtime-config.ts`                                                            | `tests/runtime-config.test.ts`                                              |
| 2.6  | CLAUDE.md luật 12, 19, Stack, cấu trúc                                | `CLAUDE.md`                                                                                      | `format:check`                                                              |
| 3.1  | Chuẩn hoá email, HMAC, hậu tố miền                                    | `identity/email.calc.ts`                                                                         | `tests/email.calc.test.ts`                                                  |
| 3.2  | Luật mật khẩu, danh sách SecLists, argon2id                           | `identity/password.calc.ts`, `identity/data/common-passwords.txt`                                | `tests/password.calc.test.ts`                                               |
| 3.3  | Mã tra cứu Crockford, tên dành riêng                                  | `identity/lookup-code.calc.ts`, `identity/reserved-names.ts`                                     | `tests/lookup-code.test.ts`                                                 |
| 3.4  | Tập đánh dấu thiết bị (hàm thuần)                                     | `identity/device.calc.ts`                                                                        | `tests/device.calc.test.ts`                                                 |
| 3.5  | AES-256-GCM, SHA-256, HMAC tách scope, token ngẫu nhiên               | `src/common/crypto/secrets.ts`                                                                   | `tests/secrets.test.ts`                                                     |
| 4.1  | Repository Prisma (36 method, transaction + outbox) + bản giả         | `identity/identity.repository.ts`, `tests/fakes/identity-repository.fake.ts`                     | `tests/identity-repository.fake.test.ts`                                    |
| 4.2  | Service factory với deps, `resolveActor`                              | `identity/identity.service.ts`                                                                   | `tests/identity.service.test.ts`                                            |
| 4.3  | Guard dùng chung, `buildApp({ deps })`                                | `src/common/auth/{auth.plugin,actor,privilege-source}.ts`, `src/app.ts`                          | `tests/auth.http.test.ts`                                                   |
| 5.1  | Đăng ký, xác nhận, gửi lại mã                                         | `identity/identity.auth.routes.ts`, `identity/identity.schema.ts`, `identity/identity.routes.ts` | `tests/registration.http.test.ts`                                           |
| 5.2  | Việc `identity.send-mail`, ba mẫu thư                                 | `identity/identity.jobs.ts`, `identity/identity.mail.ts`                                         | `tests/identity.jobs.test.ts`                                               |
| 5.3  | Miền dùng một lần: seed, so đuôi miền, master thêm/bỏ, job tuần       | `identity/identity.ops.routes.ts`, `identity/data/disposable-domains.seed.txt`                   | `tests/disposable-domains.test.ts`, `tests/disposable-domains.http.test.ts` |
| 5.4  | Việc `identity.purge-unverified`                                      | `identity/identity.jobs.ts`                                                                      | `tests/identity.jobs.db.test.ts`                                            |
| 6.1  | Đăng nhập, refresh (xoay + phát hiện dùng lại), đăng xuất, cookie web | `identity/identity.auth.routes.ts`; migration `20261010141800_session_prev_refresh_hash`         | `tests/sessions.http.test.ts`                                               |
| 6.2  | Trần phiên 20/3 đẩy phiên cũ nhất, hết hạn trượt 30 ngày              | `identity/identity.service.ts`                                                                   | `tests/sessions.http.test.ts`                                               |
| 6.3  | `/me/sessions` xem / thu hồi                                          | `identity/identity.me.routes.ts`                                                                 | `tests/sessions.http.test.ts`                                               |
| 6.4  | Quên / đặt lại / đổi mật khẩu                                         | `identity/identity.auth.routes.ts`, `identity/identity.me.routes.ts`                             | `tests/password.http.test.ts`                                               |
| 6.5  | Hai lớp TOTP (`otplib`)                                               | `identity/identity.me.routes.ts`, `identity/identity.service.ts`                                 | `tests/two-factor.http.test.ts`                                             |
| 7.1  | Google ID token sau `GoogleTokenVerifier`                             | `identity/google.verifier.ts`                                                                    | `tests/google.http.test.ts`                                                 |
| 8.1  | `/users/:id`, `/me`, `PATCH /me`                                      | `identity/identity.me.routes.ts`                                                                 | `tests/profile.http.test.ts`                                                |
| 8.2  | Đổi email có xác nhận, 1 lần / 30 ngày                                | `identity/identity.me.routes.ts`                                                                 | `tests/profile.http.test.ts`                                                |
| 9.1  | Master khoá / mở khoá, outbox, đóng đánh dấu liên quan                | `identity/identity.ops.routes.ts`                                                                | `tests/account-lock.http.test.ts`, `tests/account-lock.db.test.ts`          |
| 9.2  | `DELETE /me`, `POST /auth/deletion-requests`                          | `identity/identity.me.routes.ts`, `identity/identity.auth.routes.ts`                             | `tests/account-deletion.http.test.ts`                                       |
| 10.1 | `recordListingSubmission`: băm máy, tính lại đánh dấu, mã tra cứu     | `identity/identity.service.ts`                                                                   | `tests/device-flags.test.ts`                                                |
| 10.2 | `/ops/flags/:lookupCode` tra + gỡ kèm miễn trừ                        | `identity/identity.ops.routes.ts`                                                                | `tests/flags.http.test.ts`                                                  |
| 10.3 | Việc `identity.purge-expired`                                         | `identity/identity.jobs.ts`                                                                      | `tests/identity.jobs.db.test.ts`                                            |
| 11.1 | Nộp / duyệt giấy tờ, số được mã hoá                                   | `identity/identity.me.routes.ts`, `identity/identity.ops.routes.ts`                              | `tests/id-verification.http.test.ts`                                        |
| 12.1 | CLAUDE.md, README, `tests/README.md`                                  | —                                                                                                | `format:check`                                                              |
| 12.2 | 8 tag Swagger, `bearerAuth` trên route cần đăng nhập                  | các file `*.routes.ts`                                                                           | đọc `/docs/json` trên bản build                                             |
| 13.x | Kiểm tra tích hợp                                                     | —                                                                                                | xem bảng ở mục 1                                                            |

Ngoài kế hoạch: `package.json` thêm `build:data` (chép `src/**/data` sang `dist`, vì Dockerfile chỉ
mang `dist`); `src/common/time/time.ts` (định dạng ngày / giờ Việt Nam cho câu báo lỗi);
`tests/ops-helpers.ts` (dựng tài khoản + phiên có lớp thứ hai cho test bàn vận hành);
`.github/pull_request_template.md` sửa dòng khoá chính thành `dbgenerated("uuidv7()")` cho khớp design.

### 2.3 Kết thúc

- `openspec archive add-identity --yes` (mọi capability đều mới nên CLI tự tạo 8 spec chính), rồi
  `pnpm exec prettier --write openspec` và `spec:validate` 24/24 như `config.yaml` yêu cầu.
- Commit `e180546` một lần cho cả change: code + test + tài liệu + change đã archive + spec mới.

## 3. Quyết định tự chốt khi code (cần người đọc đối chiếu)

| Quyết định                                                                             | Vì sao                                                                                                   | Ghi ở đâu                                      |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Thêm cột `sessions.prev_refresh_token_hash`                                            | Design 4 đòi "token cũ dùng lại → thu hồi cả phiên", bảng ở design thiếu chỗ giữ băm cũ                  | `design.md` dòng `sessions`, migration thứ hai |
| `requireMaster` cũng đòi lớp thứ hai                                                   | Mọi route master trong change này đều là bàn vận hành; spec "chưa thiết lập thì không làm được gì"       | `auth.plugin.ts`                               |
| Đăng ký lại sau 90 ngày chờ xoá → service xoá hẳn dòng cũ ngay                         | Spec đòi tạo được tài khoản mới; job xoá hẳn thuộc `add-data-retention` (đợt 7)                          | `identity.service.ts` (`claimEmail`)           |
| Tên thiết bị mặc định: body → 80 ký tự đầu `user-agent` → "Thiết bị không tên"         | Open Question của design                                                                                 | `design.md` mục Open Questions                 |
| Mã xác nhận trong payload việc gửi thư được `secrets.seal`                             | pg-boss giữ dòng việc một thời gian; DB không được chứa mã thô                                           | `identity.jobs.ts`                             |
| Hai tài khoản bị khoá trên cùng máy chỉ cho ra MỘT đánh dấu `device_of_locked_account` | Partial unique là (tài khoản, loại, máy)                                                                 | `identity.service.ts` (`oneFlagPerKind`)       |
| `PrivilegeSource` + `OPS_SCOPES` đặt ở `src/common/auth/`                              | Guard dùng chung không được import module; `platform` thay bản thật sau                                  | `privilege-source.ts`                          |
| Tài khoản có quyền đã bật hai lớp không đăng nhập được bằng Google                     | Google không có chỗ nhập mã trong cùng request                                                           | `identity.service.ts` (`loginWithGoogle`)      |
| Người thường không thiết lập được hai lớp (403)                                        | Đăng nhập chỉ đòi mã với tài khoản có quyền; bật cho người thường là bật một thứ không bao giờ được kiểm | `identity.service.ts` (`setupTwoFactor`)       |

Hai Open Question còn lại trong design không chặn gì: câu chữ ba mẫu thư (đã viết ở
`identity.mail.ts`, chờ duyệt văn), và tên thiết bị (đã chốt như trên).

## 4. Chạm vào máy người dùng

- `.env.development` (local, gitignored) được nối thêm 7 biến identity với giá trị dev để server boot;
  xem lại nếu muốn khoá khác.
- DB dev `ghim_dev`: 2 migration đã áp, ~96k miền dùng một lần đã nạp, vài tài khoản smoke
  (`smoke@ghim.test`, `it…@ghim.test`). DB test chạy tmpfs nên sạch mỗi lần bật lại.
- Mailpit giữ 3 thư thử. `openspec` global đã cài. Scratchpad của Claude có bản tải SecLists và
  danh sách miền để đối chiếu.

## 5. Bẫy đã gặp, đáng nhớ cho change sau

- JWT ký theo giờ thật: đồng hồ giả trong test không làm access token hết hạn — phiên mới là thứ
  quyết định (`SESSION_EXPIRED`).
- Zod type provider gắn kiểu `null` cho response 204: phải `reply.status(204).send(null)`.
- Chỗ trên máy xếp theo `firstPostedAt`: test phải cho mỗi lượt gửi một mốc, cùng mốc thì thứ tự rơi
  vào tiebreak theo id.
- Prettier chạy lại sau mỗi lượt sửa nên `Edit` theo text cũ dễ trượt; chèn bảng README bằng script.
- Hạt giống ~96k dòng phải chia lô `createMany` (trần 65535 tham số của Postgres).

## 6. Bước kế tiếp

Theo thứ tự ở `CLAUDE.md`: `add-platform-roles` làm chung lượt với `add-categories`. Hai điểm nối đã
chờ sẵn: `PrivilegeSource` (quyền staff theo danh mục) và `RuntimeConfig` (bảng con số có phiên bản).
Quy trình: `/opsx:apply` → duyệt design + tasks → code → `check` + `test:db` + `build` → archive.
