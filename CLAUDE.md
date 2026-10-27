# CLAUDE.md — Ghim (bản làm lại)

> File này mô tả code **như nó đang là** (đối chiếu `package.json` và `src/` ngày 13/10/2026).
> Code và file lệch nhau → sửa file này cho đúng, đừng bẻ code theo một dòng đã cũ.
> Mục ghi **(chưa có)** là quy tắc cho phần sắp làm: đừng import đường dẫn đó, nó chưa tồn tại.

## Tổng quan dự án

Ghim là **sàn rao vặt**: người dùng đăng tin bán đồ, người khác xem và nhắn tin hỏi mua. Hệ thống
không giữ tiền, không giao hàng. Có hai nơi đăng tin: **sàn chung** (cả nước) và **nhóm** (trường,
công ty, cộng đồng). Máy duyệt trước, người duyệt phần máy không chắc.

- **Bản thiết kế** (gọi tắt **TK**): `docs/THIET-KE-HE-THONG.md` (+ `.pdf`) — bản đọc cho người
  không làm kỹ thuật: vì sao, ví dụ, từ điển.
- **Hợp đồng để code**: `openspec/changes/` — mọi luật của TK đã viết thành requirement + scenario,
  mỗi change một phần, xếp theo đợt. `openspec/specs/` — phần đã làm xong. Xem mục **Quy trình
  OpenSpec**. File này chỉ nói luật đặt ở **đâu trong code**. TK, change và code lệch nhau → hỏi, đừng
  tự chọn một bên. Hai luật đụng nhau → thứ tự ưu tiên ở TK phần 4 (pháp lý → không tự xử việc của mình
  → máy không phạt → người dùng biết vì sao → tiện lợi).
- **Việc đang dở**: `docs/VIEC-DANG-DO.md` — việc chờ quyết, change còn lại, checklist chuyển R2, bảo mật và CI,
  giới hạn cần theo dõi khi có người dùng thật, môi trường dev.
  Làm xong việc nào thì xoá dòng đó; gác lại việc gì thì thêm vào.
- **Hệ thống cũ**: `../../Vue/` (Express + MongoDB + agenda). Đọc để biết dữ liệu nào phải chuyển
  sang và tích hợp nào đang chạy; **không** chép pattern của nó sang đây.
- Hai cửa, một backend:
  - **App Ghim** (điện thoại): `/api/v1/*`.
  - **Bàn vận hành** (web nội bộ của master và staff): `/api/v1/ops/*`.

## Stack & công cụ

Giống dự án `../booking` (cùng phiên bản, cùng lockfile gốc):

- Runtime: **Node.js ≥ 24** (`.nvmrc`, `engines`), **pnpm 12** (`packageManager`). Dùng `pnpm` /
  `pnpm exec`, không `npm` / `npx`.
- HTTP: **Fastify 5** + **TypeScript** strict (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), ESM — import nội bộ ghi đuôi `.js`.
  KHÔNG dùng `any`. Không có file `.js` trong `src/`.
  - Đang bật: `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` (tắt khi `NODE_ENV=test`),
    `@fastify/swagger` + `@fastify/swagger-ui` (`/docs`, tắt ở production). CORS liệt kê tường minh sáu phương
    thức `GET, HEAD, POST, PUT, PATCH, DELETE` (`fix-web-api-contract`): route dùng phương thức khác phải thêm vào
    `app.ts` — test preflight trong `tests/app.test.ts` đọc phương thức từ tài liệu nên đỏ trước.
  - Đã nối: `pg-boss` (`src/lib/jobs.ts`, start/stop trong `server.ts`), `nodemailer`
    (`src/lib/mailer.ts`, sau interface `Mailer`), `@fastify/jwt` + `@fastify/cookie`
    (`src/common/auth/auth.plugin.ts`), `argon2` (`identity/calc/password.calc.ts`), `google-auth-library`
    (`google.verifier.ts`, sau interface `GoogleTokenVerifier`). Không còn gói nào cài mà chưa dùng.
- DB: **PostgreSQL 18 + Prisma 7**, driver adapter `@prisma/adapter-pg`, preview `partialIndexes`.
  - `prisma/schema.prisma` là nguồn sự thật của schema đang chạy. Các module đợt 1–4 mỗi module một migration
    `init_<module>` (`identity`, `platform_category`, `group`, `notification`, `media`, `listing`, `trust`, `screening`,
    `review`); từ đó mỗi change một migration theo tên change (`add_reports`, `add_messaging`, `add_saved_searches`…),
    cộng vài migration chỉnh sau; khoá chính
    `uuidv7()` do Postgres sinh; CHECK viết tay nằm cuối file migration và được nhắc bằng `///` ở model.
  - Chuỗi kết nối nằm ở `prisma.config.ts`, KHÔNG nằm trong `datasource` của schema.
  - Client: **đúng một instance** ở `src/lib/prisma.ts`.
- Validation + OpenAPI: **Zod 4** + `fastify-type-provider-zod` — một schema cho validate, kiểu
  TypeScript và Swagger.
- Env: `src/config/env.ts` (Zod, fail fast). Chỉ khai biến code đang dùng.
- Logger: **pino** (`src/lib/logger.ts`), dev dùng `pino-pretty`.
- Test: **Vitest**, HTTP qua `app.inject()`, mọi test chạy trên Postgres thật (container `postgres-test`).
- Lint/format: **oxlint + Prettier** (không phải ESLint). Không tự đổi rule.
- Spec-driven: **OpenSpec 1.14.1** (`@fission-ai/openspec`, ghim cứng phiên bản), lệnh `/opsx:*` —
  xem mục **Quy trình OpenSpec**.
- Skill cho agent: `.claude/skills/openspec-*` và `.claude/commands/opsx/` (sinh bởi
  `openspec update`), `.claude/skills/prisma-*` (nguồn `skills-lock.json`, chép từ booking).
- **Hạ tầng đã chốt** (08/10/2026) — gói đã cài, nối khi module đầu tiên cần tới:
  - Job nền thay agenda (TK 26): **pg-boss** trên chính Postgres, schema `pgboss` riêng — không nằm
    trong `public` nên `prisma migrate` và `db:drift` không thấy; pg-boss tự tạo bảng khi `start()`.
    Không thêm Redis. Bản đầu một tiến trình; pg-boss khoá theo job nên ngày chạy nhiều tiến trình
    không phải đổi gì. Đã nối: `src/lib/jobs.ts` (`createJobs` → `start`/`stop`/`schedule`, cron theo
    `Asia/Ho_Chi_Minh`, `singletonKey` mặc định = tên việc; `work` nhận `retryLimit` và `concurrency` — số việc
    cùng loại chạy song song mỗi tiến trình); module khai việc của mình trong
    `<module>.jobs.ts` với tên `<module>.<việc>`, nối qua `jobs` của định nghĩa module (`<module>.module.ts`).
    Handler của việc theo lịch trả `JobOutcome | void` (`partial`, `summary`); `createJobs` bọc bằng `recordedRun`
    ghi mỗi lượt vào `job_runs` (`done` / `partial` / `failed` — TK 26 luật 2, add-data-retention) qua `runLog` =
    repository của `ops`; `GET /ops/jobs/runs` (master) đọc. Việc theo sự kiện không ghi.
  - Gửi email (mã xác nhận, đổi email): **nodemailer** qua `SMTP_URL`, đứng sau interface `Mailer` ở
    `src/lib/mailer.ts` (`createSmtpMailer`, `createFakeMailer` cho test). `SMTP_URL` bắt buộc ngoài
    test vì mã xác nhận không bao giờ vào log — dev dùng **Mailpit** trong docker-compose
    (`pnpm mail:up`; SMTP `localhost:1025`, hộp thư `http://localhost:8025`). Production: SMTP của
    nhà cung cấp (Resend / Postmark / SES) — chọn khi deploy, code không đổi.
  - Đăng nhập Google: **google-auth-library** verify ID token do app gửi lên; không có OAuth redirect
    phía server. Đứng sau `GoogleTokenVerifier` (`google.verifier.ts`); `GOOGLE_CLIENT_IDS` trống =
    tắt (dev), production bắt buộc.
  - Không có lớp đăng nhập thứ hai (change `remove-two-factor`, chốt 23/10/2026): `requireMaster` chỉ kiểm vai,
    `requireOps` / `requireCategoryOps` kiểm quyền treo và phạm vi. Số giấy tờ mã hoá AES-256-GCM
    (`src/common/crypto/secrets.ts`).
  - Đo ảnh (đồng ý 12/10/2026, mở rộng 24/10/2026): **sharp** — dHash 64 bit trên ảnh 9×8 xám để so trùng, cùng cỡ,
    độ nét (phương sai Laplace), độ sáng cho luật chất lượng ảnh, đứng sau cổng `ImageInspector`
    (`src/modules/screening/run/image-inspector.ts`). Không kiểm nội dung ảnh (chốt 24/10/2026).
  - Danh sách email dùng một lần (TK 7): hạt giống `src/modules/identity/data/disposable-domains.seed.txt`
    (dự án `disposable-email-domains`, ~96k miền), nạp khi bảng rỗng lúc khởi động
    (`identity.seedDisposableDomainsIfEmpty` trong `server.ts`); việc `identity.refresh-disposable-domains`
    hằng tuần tải `DISPOSABLE_DOMAINS_URL` và chỉ thêm — không đụng miền master đã thêm hay đã bỏ (bia mộ
    `removed_at`), tải lỗi thì giữ danh sách cũ. Danh sách mật khẩu hay gặp:
    `src/modules/identity/data/common-passwords.txt` (10.000 của SecLists), không cập nhật lúc chạy.
  - **DeviceCheck của Apple: HOÃN.** Bản đầu iOS chỉ dùng mã theo nhà phát triển cộng tín hiệu phụ
    (TK 8); thêm DeviceCheck bằng một change riêng khi có tài khoản Apple Developer. Ghi ở TK 29 mục hoãn.
  - **Không có SMS** — TK quyết định số 7.
  - Realtime (chốt 11/10/2026): **socket.io** gắn vào HTTP server của Fastify, đường dẫn `/realtime`, chỉ
    websocket. Chỉ chiều server → app; phòng theo người và theo phiên, không phòng theo nhóm. Hạ tầng dùng chung
    ở `src/common/realtime/`; nhắn tin (đợt 6) dùng lại. `socket.io-client` chỉ là devDependency để test.
  - Kho ảnh (chốt 11/10/2026, đổi 14/10/2026): hai bộ nối sau cổng `Storage`, chọn bằng `STORAGE_URL`. **Cloudinary**
    dùng tạm cho production và dev (`cloudinary://key:secret@cloud?folder=…`, `src/lib/storage/cloudinary.storage.ts`, gọi API
    bằng `fetch`, không SDK — change `use-cloudinary-storage`: Backblaze B2 không chặn được ghi đè ảnh). **Chuẩn S3**
    qua `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`: Cloudflare R2 về sau, **RustFS** trong docker-compose cho
    test (`storage-test`, cổng 9110, tmpfs) và dev khi cần (`pnpm storage:up`, cổng 9100). Một biến `STORAGE_URL` (`src/config/storage-url.ts`); cửa duy nhất `src/lib/storage/storage.ts`
    (`Storage`: ký quyền tải một ảnh — S3 `PUT` kèm `If-None-Match: *`, Cloudinary `POST` biểu mẫu với
    `overwrite=false` —, ký đường xem — S3 có hạn, Cloudinary không hết hạn —, `head`, `read` có trần byte cho máy
    duyệt băm ảnh, `copy`, `deleteMany`, `list`).
    App tải thẳng, ảnh không qua server; hướng dẫn cho app ở `docs/media.md`. MinIO đã gỡ image khỏi Docker Hub.
- **Đẩy lên điện thoại** (`src/common/push/expo-push.ts`, change `add-notifications`, chốt 17/10/2026): Expo Push Service
  qua `fetch` thuần, không package; `EXPO_PUSH_URL` có mặc định, `EXPO_ACCESS_TOKEN` tuỳ chọn; token gắn phiên
  (`sessions.push_token`, `identity` sở hữu); test dùng `tests/fakes/push.fake.ts`, `buildTestApp` mặc định `noopPush`.
  Tài khoản Expo / EAS, khoá FCM và APNs do chủ dự án tạo khi app sẵn sàng — server chỉ gửi khi có token đăng ký.
- **(chưa có)** — vẫn phải hỏi trước vì chưa chọn: theo dõi lỗi (hệ thống cũ dùng Sentry). Kiểm nội dung ảnh: không
  làm (chốt 24/10/2026) — đừng đề xuất dịch vụ hay mô hình nhận diện ảnh.

## Cấu trúc thư mục (BẮT BUỘC tuân theo)

```
openspec/
  config.yaml                 ← bối cảnh dự án + luật cho từng artifact của change
  specs/<capability>/spec.md  ← hành vi ĐANG chạy (chỉ sửa qua archive một change)
  changes/<tên>/              ← change đang làm: proposal, specs (delta), design, tasks
  changes/archive/            ← change đã xong, giữ làm lịch sử
prisma/
  schema.prisma               ← schema đang chạy
  migrations/                 ← KHÔNG sửa migration đã apply
prisma.config.ts
src/
  app.ts                      ← buildApp(): plugin, dựng module theo thứ tự phụ thuộc, lặp danh sách module;
                                bộ phát outbox đã nối bên nghe của mọi module (`app.outbox`), cổng realtime
  server.ts                   ← jobs.start(), `startup` của từng module, bật `app.outbox`, listen; tắt theo thứ tự
                                HTTP (kèm socket) → bộ phát → jobs → Prisma
  config/{env,database-guard,storage-url,trust-proxy}.ts
  lib/{prisma,logger,mailer,jobs}.ts
  lib/storage/                ← kho ảnh: `storage.ts` (cổng `Storage`, `imageKey`, `StorageUnavailableError`),
                                `s3.storage.ts`, `cloudinary.storage.ts` (tạm, tới khi R2), `create-storage.ts` (chọn
                                bộ nối theo `STORAGE_URL`, chỉ `app.ts` gọi) — bộ nối không import nhau
  common/
    audit/audit.ts            ← `appendAudit(tx, entry)`: nhật ký bàn vận hành, cùng transaction với thay đổi
    auth/{auth.plugin,actor,privilege-source}.ts ← guard dùng chung: authenticate, requireVerifiedEmail,
                                requireMaster, requireOps(scope), requireStaff (mọi staff đang hiệu lực),
                                requireCategoryOps(categoryIdOf); `Actor`
                                trên request, `actorOf(request)` cho handler; `PrivilegeSource.staffGrant` trả
                                cả gói quyền staff trong một lượt đọc (bản thật: `createPlatformPrivilegeSource`)
    config/config-keys.ts     ← sổ đăng ký mọi con số TK 28: kiểu, giá trị khởi đầu, nhóm, khoảng hợp lệ;
                                ràng buộc giữa khoá (`configRelationIssues`)
    config/runtime-config.ts  ← `RuntimeConfig.get(key)`; bản tĩnh cho test và CLI
    crypto/secrets.ts         ← AES-256-GCM (`SecretBox`), SHA-256, HMAC tách scope, token ngẫu nhiên
    crypto/lookup-code.ts     ← mã tra cứu 8 ký tự Crockford: dấu tài khoản (`identity`), lượt máy kết luận (`screening`)
    errors/{app-error,error-handler}.ts
    http/cache.ts             ← mặc định `no-store` (hook `onSend`); route công khai mở bằng `cacheFor` + `CACHE_*`
    outbox/outbox.ts          ← `appendEvents(tx, events)`: sự kiện chéo module, cùng transaction
    module/app-module.ts      ← `AppModule`: route, bên nghe outbox, việc nền, bước khởi động của một module
    outbox/dispatcher.ts      ← bộ phát: nhận lô `FOR UPDATE SKIP LOCKED` có hạn giữ, thử lại lùi dần; `kick()`
                                chạy một lượt sớm sau mỗi request ghi (hook `onResponse` của `app.ts`)
    realtime/realtime.ts      ← socket.io ở `/realtime`: xác thực lúc bắt tay, phòng theo người và theo phiên,
                                `emitToUser` / `disconnectUser` / `disconnectSession`; hướng dẫn cho app ở
                                `docs/realtime.md`
    plugins/swagger.ts
    push/expo-push.ts         ← đẩy lên điện thoại qua Expo Push Service (`PushSender`, `noopPush`)
    schemas/{response,pagination,cursor,money,device-headers}.ts ← money.ts chỉ có `priceSchema`; cursor.ts = phân trang con trỏ
    text/fold.ts              ← bỏ dấu + hoa + gộp khoảng trắng: tên dành riêng, tìm khu vực
    time/time.ts              ← định dạng ngày / giờ theo Asia/Ho_Chi_Minh cho câu báo người dùng
    utils/{defined,sequential}.ts
  modules/<module>/
    <module>.module.ts        ← `create<Module>Module(deps)` → `{ service, module: AppModule }`
    <module>.routes.ts        ← chỉ đăng ký plugin con; route thật tách theo cụm (xem `<cụm>/`)
    <module>.service.ts       ← interface của module + factory `createXService(deps)`; quá 500 dòng thì tách
                                service theo cụm, `createXService` ghép lại, interface không đổi; phần các cụm
                                dùng chung ở `<module>.shared.ts`
    <module>.events.ts        ← (nếu có) bên nghe outbox của module
    <module>.repository.ts    ← toàn bộ truy vấn Prisma, kể cả transaction + ghi outbox
    <module>.schema.ts        ← Zod schema + hằng/tập giá trị của module
    <module>.ports.ts         ← (nếu có) hợp đồng với module khác — kiểu các module kia cài hay import; module khác
                                import từ đây, không từ `<module>.shared.ts` hay một `<cụm>/` (vd `listing.ports.ts`)
    <module>.jobs.ts          ← (nếu có) việc nền của module: `registerXJobs(jobs, deps)`
    <module>.mail.ts          ← (nếu có) mẫu thư thuần văn bản
    calc/<tên>.calc.ts        ← hàm tính toán thuần, không chạm DB, dùng từ hai chỗ trở lên trong module (vd
                                `identity/calc/email.calc.ts`, `listing/calc/listing.calc.ts`); gốc module không chứa calc
    <cụm>/                    ← (module lớn) một mối quan tâm: `<cụm>.routes.ts` (route + schema + guard),
                                `<cụm>.service.ts`, calc chỉ cụm đó dùng — vd `identity/{auth,account,ops}/`,
                                `listing/{posting,read,system}/`, `screening/{run,ops}/`,
                                `review/{queue,desk,schedule,stats}/`
    data/                     ← (nếu có) file tĩnh đi kèm, đọc bằng `new URL('./data/…', import.meta.url)`;
                                tsc không chép nên `pnpm run build` có bước `build:data` chép `src/**/data` sang dist
  cli/                        ← script chạy tay, không qua HTTP: `create-master`
                                (dùng `cli-identity.ts`), `build-regions` (sinh `region/data/regions.json`),
                                `smoke-posting` (`pnpm smoke:posting`: chạy khói luồng đăng tin trên server dev đang
                                chạy, đọc mã xác nhận qua `smoke-mail.ts`); `cli-args.ts` đọc tham số dòng lệnh
tests/*.test.ts               ← phẳng, không chia thư mục con; chạy trên Postgres test
tests/*.db.test.ts            ← ghi thẳng bằng Prisma để kiểm ràng buộc của DB, tiện ích ở `tests/db-helpers.ts`
```

- **Không có tầng controller**: handler trong `routes.ts` gọi service rồi trả response.
- **Thư mục cụm** (chốt 12/10/2026): lập `<cụm>/` khi cụm có từ hai file trở lên chỉ cụm đó dùng. File dùng từ hai cụm
  trở lên không nằm trong cụm nào, nên không cụm nào import vào thư mục của cụm khác. Gốc module chỉ giữ phần khung
  (module, routes, service, repository, schema, shared, ports, events, jobs, outbox). Module nhỏ để phẳng.
  `group` không có cụm có chủ ý: route chia theo người dùng (công khai / quản trị nhóm / vận hành) còn service chia
  theo việc (`membership` / `admin`) — muốn tách cụm thì sắp lại route cho khớp service trước.
- **Thư mục `calc/`** (chốt 15/10/2026): mọi calc thuần dùng chung trong module nằm ở `calc/`, kể cả module chưa có cụm;
  `calc/` không import cụm nào, cụm nào cũng import được `calc/`. Calc chỉ một cụm dùng thì ở trong cụm đó
  (`listing/posting/edit.calc.ts`); dùng từ hai module trở lên thì không thuộc module nào → `src/common/` (vd
  `common/crypto/lookup-code.ts`). Tên `calc/` chứ không `rules/`: ở `screening`,
  "luật" là khái niệm nghiệp vụ (`ops/rules.service.ts` — luật của máy duyệt). Calc đọc file dữ liệu thì đường dẫn
  là `new URL('../data/…', import.meta.url)` — typecheck không bắt sai đường dẫn này, chỉ khởi động server mới bắt.
- **Không có `<module>.types.ts`**: DTO chính là response schema Zod trong `<module>.schema.ts`.
- Tên module kebab-case, **số ít**. Đang có: `health`, `identity`, `platform`, `category`, `region`, `group`,
  `notification`, `media`, `listing`, `trust`, `screening`, `review`, `messaging`, `ops`.
- `buildApp(overrides)` nhận `repositories: { identity, platform, category, region, group, media, listing, trust, strike,
screening, review, report, messaging, ops }`,
  `storage`, `trust` (cổng mức tin cậy và hạn mức mà `listing`, `group` hỏi — bỏ trống là module `trust` thật),
  `screening` (cổng máy duyệt `listing` gọi trong lượt gửi — bỏ trống là module `screening` thật) và hạ tầng dùng chung
  (jobs, mailer, googleVerifier, push, privilegeSource, config, clock) — bỏ trống là bản thật. `RuntimeConfig.version()` cho
  biết phiên bản bảng con số đang đọc (kết quả tính theo con số ghi kèm, cam kết 33).
  `privilegeSource` và `config` mặc định là bản thật của `platform` dựng trên repository của nó. Service
  của module tra qua `app.modules` (`app.modules.platform`…); `app.moduleList` là danh sách định nghĩa theo
  thứ tự dựng. Test HTTP dùng `buildTestApp` (`tests/test-app.ts`), cùng hình dạng overrides.
- **Thêm một module mới**: viết `<module>.module.ts` trả `{ service, module }` (route, và nếu có: bên
  nghe outbox, việc nền, bước khởi động); thêm repository vào `Repositories` và `repositories` của
  `tests/test-app.ts`; thêm service vào `AppServices`; dựng nó trong `buildApp` đúng chỗ theo thứ tự phụ
  thuộc và thêm vào `moduleList`. `server.ts` không phải sửa.

### Module theo TK phần 30 — thứ tự xây theo TK phần 29

| Đợt  | Module         | Phần TK    | Sở hữu (chỉ module này được GHI)                                                                             |
| ---- | -------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| 1    | `identity`     | 7, 8       | Tài khoản, email chuẩn hoá + dấu băm, phiên đăng nhập, Google, dấu thiết bị                                  |
| 1    | `platform`     | 5, 6, 28   | Master, quyền staff theo danh mục, **bảng con số có phiên bản**, nội dung trợ giúp                           |
| 1    | `group`        | 9, 10      | Nhóm, chế độ, thành viên + đường vào, huy hiệu, đơn vị con, chủ nhóm                                         |
| 1    | `category`     | 11         | Danh mục, mẫu thông tin, trần giá, giá tham chiếu, mức rủi ro                                                |
| 1    | `region`       | 11         | Tỉnh, phường sau sáp nhập, tên cũ, tìm bỏ dấu — tách khỏi `category` 24/10/2026, spec vẫn `category/regions` |
| 2    | `media`        | 25         | Ảnh, nhãn "chưa xác nhận", dọn ảnh (kiểm ảnh thuộc `screening`)                                              |
| 2    | `listing`      | 12, 18, 19 | **Trạng thái tin**, nháp, nơi đăng, ngày hiển thị, cờ tạm ẩn, tin đã lưu, lượt tìm đã lưu                    |
| 2, 5 | `trust`        | 20, 21, 22 | Mức tin cậy, hạn mức, tin sạch (đợt 2); gậy, khiếu nại, ân xá (đợt 5)                                        |
| 3    | `screening`    | 13, 14     | **Kết quả máy**, cụm từ cấm, luật + trọng số, kiểm ảnh, lý do hạn chế `machine`                              |
| 4    | `review`       | 16, 17, 23 | **Việc** và hàng chờ, nhận việc 10 phút, quyết định của người, hậu kiểm, báo cáo                             |
| 6    | `messaging`    | 24         | Hội thoại, tin nhắn, chặn người                                                                              |
| 1, 6 | `notification` | 24         | Hộp thư, nhóm bật/tắt, tắt tiếng nhóm, realtime (đợt 1); đẩy thông báo (đợt 6)                               |
| 7    | `ops`          | 25, 26     | Dọn dữ liệu theo hạn lưu, tạm giữ bằng chứng, sổ việc nền `job_runs`, dọn outbox                             |

`media` lên đợt 2 (TK 29 xếp ở đợt 3) vì nháp tin đăng đã cần ảnh; chỉ phần **kiểm** ảnh ở đợt 3.
`notification` nghe `group.*`, các `listing.*` có dòng ma trận (`notification.listing-matrix.ts`) và
`media.image.missing` (`notification.media-matrix.ts`, N38 ảnh tin, N39 ảnh đại diện — change `notify-missing-images`),
`review.*` (`notification.review-matrix.ts`, N40–N42 cho mọi master, người nhận hỏi `identity.masterIds`; N45
`review.listing.decided` báo người đăng kết quả duyệt — `review` phát trong transaction của nhật ký quyết định), và
mũi tên `hold`, `recall` của `listing.state.changed` (N43, N44 — câu của máy hỏi `screening.notices`; change
`notify-listing-decisions`), và `messaging.message.sent` (`notification.messaging-matrix.ts`, N47 — nội dung tin nhắn hỏi
`messaging.previewOf`; gộp theo hội thoại nhưng `collapse.alertEvery` nhắc mỗi tin — change `add-notifications`). Dòng có
`alert` xếp việc `notification.push` (`notification.jobs.ts`): token của phiên còn sống qua `identity.pushTargets`, bỏ máy
đang mở đúng hội thoại (`messaging.viewingSessions`), gửi qua cổng `PushSender`, ticket vào `push_tickets`;
`notification.push-receipts` mỗi 15 phút đọc biên nhận, `DeviceNotRegistered` → `identity.forgetPushToken`;
câu cần tiêu đề hay người đăng của tin thì hỏi `listing` qua cổng (`titles`, `noticeTargets`), không đọc bảng của nó.
Gậy, khiếu nại, mức tin cậy, thời gian chờ (`notification.trust-matrix.ts`, N49–N58 — change `add-trust-notices`): nghe
`trust.strike.issued` / `inherited` / `cancelled` / `decided` / `expired`, `trust.appeal.decided`, `trust.tier.changed` và
`screening.cooldown.started`; câu dựng từ trạng thái lúc gửi qua ba cửa đọc `trust.strikeDetail`, `trust.standingOf`,
`identity.accountSummaries` (lọc tài khoản đã xoá — gậy ra được trên bản lưu của tài khoản đã xoá); nhóm `trust_strikes`,
ký "Ghim". Cố ý không báo: `strike.issued { inherited }` (N50 nói thay), `strike.cancelled { cause: 'appeal' }` (N51 nói
thay), `strike.decided` `cancel` / `kept`, `strike.standing`, `strike.review_due`, `appeal.filed`, `appeal.closed`. Câu thời
gian chờ là `cooldownSentence` của `screening.outbox.ts` — chung với lỗi 429 `SUBMISSION_COOLDOWN`.
`screening` nghe `media.images.deleted` (`{ imageIds }`, phát cùng transaction với ba lượt xoá dòng ảnh của `media`) để
bỏ dấu ảnh — ảnh đã xoá hẳn không còn là ứng viên trùng (change `fix-audit-trust-media-low`).

`messaging` (change `add-messaging`, hướng dẫn cho app ở `docs/messaging.md`): hội thoại gắn với một tin (một tin + một người mua =
một hội thoại; cột "phía tôi" theo vai mua / bán, `sideOf`), tin nhắn, chặn người, báo cáo từ hội thoại qua cổng `review.submitReport`
kèm `conversationId` trên lượt báo; hạn mức hội thoại mới mỗi ngày theo mức (`quota.newConversationsPerDay*`, ngày lịch giờ Việt
Nam); tin nhắn qua `screening.phraseVerdict`. Phát `messaging.conversation.opened`, `messaging.message.sent` (không mang nội
dung); tự nghe `message.sent` để báo `message:new` qua realtime và `identity.account.deleted` để ẩn phía người xoá. Cổng ngược nối
muộn: `trust.buyerInterest.hasInquiry` (tin sạch lối "đã bán"), `review.messaging.transcripts` (bản ghi cho người xử). Chỉ
`messaging` ghi hội thoại, tin nhắn, chặn. Trả giá (change `add-price-offers`): đề nghị giá là một loại tin nhắn (`kind = 'offer'`, partial unique
`messages_one_pending_offer` — một đề nghị đang chờ mỗi hội thoại), chỉ người mua gửi, người bán trả lời bằng ghi có điều kiện sau khi
khoá hội thoại; phát `messaging.offer.answered` → `message:updated` cho người mua và dòng thông báo cùng khoá gộp của hội thoại.
DTO hội thoại đọc thẻ tin qua `listing.conversationCards` (giá, thương lượng, trạng thái, ảnh bìa — tin bị gỡ không có ảnh) và ảnh
đại diện qua `identity.avatarUrls`. Hội thoại với một đội (change `add-team-conversations`): cột `kind` (`listing` / `support` / `group`), CHECK
`conversations_kind_check`, partial unique một hội thoại hỗ trợ mỗi người và một hội thoại mỗi người + nhóm; phía đội đi cột
"seller" (`seller_read_at` = đã đọc chung), `team_pending_since` là khoá hàng hỗ trợ. Ai trong đội tính lúc gọi qua
`ownedBy` (`messaging.shared.ts`): quản trị nhóm qua `group.conversationTeam` (dựng trên `reviewersOf` — trừ vai treo), staff hỗ
trợ chỉ qua `/ops/support/*` (`messaging.ops.routes.ts`, `support.service.ts`). `messaging.message.sent` mang `recipientIds` +
`kind` (bên nghe đọc cả `recipientId` dạng cũ); tin hỗ trợ báo `support:pending` tới `platform.activeStaffWithScope('support')`.
`ops` dọn nhóm đóng thì xoá luôn hội thoại với quản trị của nhóm, trừ hội thoại giữ làm bằng chứng. Trạng thái hoạt động (change
`add-activity-status`): "đang hoạt động" = có kết nối realtime (`Realtime.onlineAmong`, trong bộ nhớ một tiến trình); mốc
`accounts.last_seen_at` do `identity.recordSeen` ghi khi gateway báo `onPresence` (kết nối mở, kết nối cuối cùng đóng), không ghi
tài khoản đã xoá; `accounts.show_activity` là công tắc hai chiều; chỉ hội thoại về tin, không chặn, không rời mới có
`counterpart.activity`, mốc làm tròn phút và quá `messaging.activityVisibleDays` thì không hiện. Ảnh trong tin nhắn (change
`add-message-images`): tối đa `MESSAGE_IMAGES_MAX` ảnh mỗi tin (CHECK `messages_images_check`), ảnh mang chủ `conversation` của
`media` (`resolve` trước, `attach(tx)` trong transaction gửi), luật chất lượng của ảnh tin hỏi qua
`screening.messageImageIssue`; hội thoại xoá hẳn thì `media.purgeOwners('conversation', …)`.

`listing` vị trí trên bảng tin (change `prepare-promotions`): `listings.rank_at` là cột xếp hạng của bốn index bảng tin và
con trỏ trang, đặt cùng `first_live_at` trong `nextClock` (tin trùng của mình kế thừa qua `rankAsListingId`) — chỉ "đẩy lên
đầu" mới tách hai cột; CHECK `listings_rank_check` chỉ đòi hai cột cùng null. Phí đăng tin là `listing/calc/fee.calc.ts`
(`postingFee`, trả 0 Xu — TK 29), `trust` đưa vào `quota.fee` của bảng uy tín qua cổng dữ kiện.

`listing` đẩy tin của người quản trị (change `add-admin-boost`, miễn phí): `listing/boost/` (`boost.service.ts`,
`boost.routes.ts`) + `calc/boost.calc.ts` (`boostRole`, `boostBlock`, `bumpRetryAt`, `activeFeaturedUntil`). Chỉ `listing`
ghi `rank_at`, `featured_until`, `last_bumped_at` — qua `repository.boost`: khoá dòng, một câu `$executeRaw` không tăng
`version`, không đổi `updated_at`, nhật ký cùng transaction; gói trả Xu sau này gọi cổng của `listing`. Hạn nổi bật đã qua
đọc như null (DTO, dải), không việc nền dọn. Dải "Tin nổi bật" đi qua `visibleWhere` của đúng bảng tin. **Luật phạm vi
nhóm viết hai chỗ**: `boostRole` và `groupRoleOver` của `review` (`listing` dựng trước `review`, gọi ngược sẽ vòng) — đổi
một chỗ thì đổi cả hai; quyền staff đọc qua `privileges` (`PrivilegeSource`) mỗi lượt.

`trust` phần gậy (change `add-strikes`, hướng dẫn ở `docs/strikes.md`): `strike/` ra gậy trong transaction quyết định của
`review` (`issueStrike(tx)`), khiếu nại, kênh hỗ trợ, ân xá, quyết gậy nghiêm trọng / xem lại; `calc/strike.calc.ts` thuần (hiệu
lực, điểm, mốc hết tạm khoá). Mọi thay đổi phát `trust.strike.standing` — `listing` (lý do `strike`, `strike_wave`), `identity`
(khoá / mở, dấu máy, chặn email), `platform` (treo quyền), `group` (mất vai, thiếu chủ), `review` (việc về gậy, hàng 2) nghe và
hỏi lại `trust` qua cổng nối muộn. Gậy đi theo dấu băm email: `identity.account.created` / `email_changed` mang `emailHash`.
Cho `notification` (change `add-trust-notices`): `trust.appeal.decided { verdict }` phát mọi lượt có kết quả khiếu nại, kể cả
thua và lượt tự thắng khi quá hạn; `trust.strike.inherited { strikeIds }` phát một lần cho cả lượt kế thừa, cạnh các
`strike.issued { inherited: true }`.

`review` (change `add-review-queues`, hướng dẫn cho bàn vận hành và app ở `docs/review.md`): `queue/` sinh, gộp, huỷ
việc theo `listing.state.changed` và sự kiện `group`, `platform`, `identity`; `desk/` hàng chờ, nhận việc, quyết
định (bàn vận hành `/ops/review`, app `/groups/:groupId/review`); `schedule/` ba job (mỗi phút, mỗi giờ, thứ Hai
08:00); `stats/` số liệu cho master. Ai xử việc tính lúc đọc (`calc/route.calc.ts`), không lưu. Quyết định đổi tin qua
cổng của `listing` (`review`, `confirmLive`, `detachByGroup`) với hook `after(tx)` — đóng việc, ghi nhật ký, quay mẫu
người duyệt trong cùng transaction đổi tin. Ngược lại `review` cài `OpenWork.blocksPlacement` cho `listing`. Mã lỗi
riêng: `TASK_CLAIMED`, `TASK_NOT_CLAIMED`, `TASK_CLOSED`, `TASK_REASSIGNED`, `TASK_OPEN`, `LISTING_CHANGED`,
`OUTCOME_NOT_ALLOWED` (409). N36 (change `add-trust-notices`): `addReason` phát `review.task.group_held { taskId, groupId }`
cùng transaction khi việc về tin trong nhóm **chuyển vào** hàng 0 (gộp vào việc đã ở hàng 0, `backfill` thì im);
`notification` hỏi lại `groupHeldNotice(taskId)` (`desk/`) lúc gửi — người xử theo `routesFor`, chỉ cấp quản trị nhóm,
kèm số việc hàng 0 đang mở mỗi người xử được, cùng phép lọc của `groupQueue`.
Báo cáo (change `add-reports`): `report/` — `POST /reports`, `GET /me/reports`, bảng `reports` / `report_entries` /
`reporter_scores`. Báo cáo về tin là lý do `report` / `report_severe` (hàng 1) trên việc của tin; báo cáo về một
người là việc gắn `review_tasks.account_id` (không có tin), bậc `safety_staff` (scope `user_reports`). Lý do báo cáo
sống qua xoá tin, rút, đã bán, xoá tài khoản, đóng nhóm (`cancel` chỉ bỏ lý do khác) — chỉ quyết định đóng được, trên
bản lưu (`reviewSubject(id, { includeDeleted })`). Tạm ẩn tự động là lý do `reported` của `listing`, đối chiếu qua
`review.report.hide_changed` + `OpenWork.reportHidden`. Hệ quả cấm khỏi nhóm / khoá tài khoản / mất tin sạch áp ở bên
nghe `review.report.decided` (`group.banFromReport`, `identity.lockFromReport`, `trust.voidByReport`); N46 báo người
báo. Mã lỗi: `CANNOT_REPORT_SELF` (400), `REPORTING_SUSPENDED` (403), `REPORT_RATE_LIMITED` (429).
Endpoint của bàn vận hành nằm trong module sở hữu dữ liệu, đăng ký dưới tiền tố `/api/v1/ops/...` —
không có module `ops-*` gom route của người khác.

**Thứ tự change — làm và archive đúng thứ tự này** (change sau thêm requirement vào capability của
change trước): đợt 1 `add-identity` → `add-platform-roles` → `add-categories` → `fix-session-refresh-race` →
`harden-module-infra` → `tune-hot-paths` → `cache-public-reads-revoke-deleted-staff` →
`harden-production-runtime` → `add-groups` → `add-notification-core` (kéo từ đợt 6, chốt 11/10/2026) — mười change
này đã archive 10–11/10/2026 · đợt 2
`add-media` (đã archive 11/10/2026) → `add-listings` → `add-trust-tiers` (cả hai đã archive 12/10/2026) · đợt 3 `add-screening` (đã archive 13/10/2026) → `add-image-moderation` (tách ra 12/10/2026, bỏ 24/10/2026: không kiểm nội dung ảnh) · đợt 4 `add-review-queues` (đã archive 15/10/2026) → **sửa lỗi rà soát 15/10/2026 trước mọi tính năng** (`docs/RA-SOAT-15-10-2026.md`; đợt 1 bảo mật = `fix-audit-security`) →
`add-reports` (đã archive 16/10/2026) · đợt 5 `add-strikes` (đã archive 17/10/2026) · đợt 6 `add-messaging` → `add-notifications` (cả hai đã archive 17/10/2026) → `add-price-offers` → `add-team-conversations` → `add-activity-status` (làm 18/10/2026 theo yêu cầu của app `ghim-app`, cả ba đã archive 22/10/2026) → `add-join-request-status` (cũng từ lượt nối `ghim-app`, đã archive 18/10/2026) → `add-trust-notices` (thông báo gậy, khiếu nại, mức tin cậy, thời gian chờ + N36 — rơi giữa `add-strikes`, `add-notifications`, `add-review-queues`; đã archive 24/10/2026) → `add-me-staff-flag` (`/me` có cờ `staff` thay `twoFactorEnabled` cho lối vào bàn vận hành của `ghim-app`) → `add-image-quality-checks` (kiểm chất lượng ảnh thay kiểm nội dung) — cả ba gộp vào `main` qua PR #14, archive 24/10/2026 → `add-listing-filters` (lọc tin theo mẫu thông tin của danh mục qua `attrs` của `GET /listings`, TK 11 — việc app chờ ở `docs/VIEC-DANG-DO.md` mục 8; gộp `main` qua PR #15, archive 24/10/2026) → `add-login-device-marks` (dấu máy ghi lúc đăng nhập — `device_logins` — cho luật xung đột lợi ích và người hỏi mua; việc dở `VIEC-DANG-DO.md` mục 1; gộp `main` qua PR #16, archive 24/10/2026) → `add-ops-daily-stats` (`GET /ops/stats/daily` cho master: tài khoản mới, lượt máy, tin lên bảng, quyết định người theo ngày Việt Nam — từ ô "Chưa có API" của app; gộp `main` qua PR #18, archive 24/10/2026) → `add-ops-account-directory` (danh bạ tài khoản cho master / staff hỗ trợ: `GET /ops/accounts`, `/ops/accounts/:id`; từ tab Người dùng của app; gộp `main` qua PR #19, archive 24/10/2026) → `add-saved-listings` (lưu tin để xem lại, TK 15 — mục hoãn của TK 29, người dùng chốt làm 25/10/2026; thay dữ liệu mẫu ở mục "Đã lưu" của app) → `add-id-verification-status` (người nộp đọc hồ sơ xác minh gần nhất của mình, TK 7) → `fix-group-task-report-scope` (bàn duyệt của nhóm chỉ thấy báo cáo thường về chính tin, TK 23) → `add-saved-searches` (lưu lượt tìm, báo tin mới khớp — nhóm thông báo thứ mười, TK 24; người dùng chốt luật 25/10/2026) — cả bốn gộp vào `main` qua PR #21, archive 25/10/2026 → `add-feed-sort` (sắp xếp bảng tin, tìm kiếm theo mới nhất / giá, TK 11) → `add-home-province` (tỉnh/thành riêng tư của người dùng cho "Gần bạn", TK 11) → `add-screening-stats` (số liệu máy duyệt theo tháng cho master, TK 14, 25) → `add-help-content` (nội dung trợ giúp master soạn, ai cũng đọc, TK 24) → `add-message-images` (tối đa 4 ảnh một tin nhắn, qua luật chất lượng của ảnh tin, TK 24, 25) → `add-screening-ops-reads` (đọc từ khoá danh mục, ảnh của danh sách trắng — cho năm màn máy duyệt của app) — năm change trước gộp `main` qua PR #22, change cuối qua PR #23, cả sáu archive 26/10/2026 qua PR #24 → `add-group-manual-review` (công tắc "duyệt tay mọi tin" của nhóm: máy cho qua vẫn giữ cho quản trị nhóm, chỉ tin gửi mới và gửi lại — TK 9, 13, 16; người dùng chốt 26/10/2026) · đợt 7
`add-data-retention` (đã archive 17/10/2026) · giữ chỗ gói đẩy tin `prepare-promotions` (đã archive 17/10/2026;
kế hoạch `docs/KE-HOACH-GOI-DAY-TIN.md`) → `add-admin-boost` (người quản trị đẩy tin, đặt nổi bật miễn phí — chốt
27/10/2026, đi trước gói trả Xu; `add-promotions` phải viết lại delta `listing/visibility` trên bản sau change này) →
`add-wallet` → `add-promotions` (hai proposal còn mở trong
`openspec/changes/`, nằm chờ chủ dự án chốt) → `add-topup` (chưa viết — viết khi quyết thu tiền).

- `add-platform-roles` và `add-categories` cần nhau (quyền staff gắn theo danh mục; danh mục cần staff soạn
  mẫu) nên làm chung một lượt và archive trước `add-groups`; `add-groups` chỉ thêm requirement vào
  `identity/` và `group/`, không đụng `category/`, nên đổi thứ tự không lệch spec nào.
- `fix-session-refresh-race` và `harden-module-infra` là kết quả rà soát 10/10/2026 sau ba module đầu, đã
  archive trước `add-groups`: module mới dựng trên hạ tầng đã sửa.
- Việc chạy theo lịch đã cần từ đợt 1 (dọn đăng ký dở dang, nhóm thiếu chủ quá 30 ngày) dù `ops` ở đợt 7:
  dùng pg-boss ngay từ `add-identity`; `ops` (add-data-retention) chỉ nhận việc dọn outbox và lịch dọn dữ liệu —
  bộ phát outbox vẫn ở `common/outbox` vì mọi module cần nó từ đợt 1.

`ops` (change `add-data-retention`, hướng dẫn ở `docs/retention.md`): dựng **sau cùng** trong `buildApp`, chỉ gọi cổng
hạn lưu của module sở hữu dữ liệu, không ghi bảng của ai (`listing.retentionDue / purge / softDeleteWhere / remindPurge`,
`media.purgeOwners`, `group.purgeDue / purgeClosed`, `identity.purgeDue / purgeDeletedAccount / purgeDeviceData /
pseudonymOf`, `messaging.retentionDue / purge`, `notification.purgeBefore`, `screening.foldRuns`, `trust.strikesOfListings /
anonymizeDue / anonymizeStrike / dropLiftedEmailHashes`, `review.reportHolds / pseudonymizeDecisions`, `pseudonymizeAudit` ở
`common/audit`). `retention.service.ts` = dãy bước cố định (`RETENTION_STEPS`) theo trang 500, trần 10 phút → `partial` +
`ops.retention-continue { from }`; `evidence-hold.service.ts` tính tạm giữ từ dữ kiện của `review`, `trust`; luật thuần ở
`calc/retention.calc.ts`. Con số `retention.*` (nhóm "Hạn lưu"). Hai khoá ngoại đã bỏ: `conversations.listing_id`,
`strikes.account_id` (ẩn danh hoá thay bằng mã giả; `identity.account.purged` → `trust` xoá gậy của đăng ký dở đã dọn).
N48 `listing.purge.reminder` ở `notification.listing-matrix.ts`.

Module mẫu để bám theo: **`src/modules/identity/`** — repository với transaction + outbox, service
factory nhận deps (đồng hồ, config, jobs…), route tách theo mối quan tâm, calc thuần có test riêng,
jobs với handler thuần. `../booking` không có trong workspace này; chỉ còn là nguồn gốc của stack.

## Quy tắc code chung (BẮT BUỘC)

1. Tầng `route → service → repository → Prisma`. Route không chứa nghiệp vụ; service không thấy
   `request`/`reply` và không import Prisma; repository không chứa luật nghiệp vụ.
   Ghép bằng factory: `createXRepository(prisma)` → `createXService(repo, …)`.
2. Mọi route khai `schema` (body / params / querystring / response) bằng Zod.
3. Mọi lỗi throw qua `AppError` hoặc subclass trong `src/common/errors/app-error.ts`. Chỉ
   `src/common/errors/error-handler.ts` map lỗi sang HTTP, kể cả lỗi Prisma (`PRISMA_ERRORS`:
   `P2002` → 409, `P2025` → 404, `P2003` → 409) và lỗi Postgres qua driver adapter (`P2039`, map theo
   SQLSTATE ở `POSTGRES_ERRORS`: `23P01`, `23514` → 409). Cần thêm mã thì thêm vào bảng đó. Kho ảnh tạm không trả
   lời (bộ nối ném `StorageUnavailableError` của `src/lib/storage/storage.ts`) → 503 `STORAGE_UNAVAILABLE`.
   Thông báo lỗi cho người dùng viết tiếng Việt, ngắn, nói cách sửa. Lỗi tự sửa được thì nói cụ thể;
   **dấu hiệu gian lận thì không** — chỉ "đang chờ người duyệt" (TK nguyên tắc 8). Chữ người dùng và bàn vận hành đọc
   gọi gậy là **cảnh cáo** (gậy nặng → cảnh cáo nặng, gậy nghiêm trọng → vi phạm nghiêm trọng, điểm gậy → điểm vi phạm);
   code, spec, mã lỗi, `type` thông báo vẫn là gậy / `strike` (rename-strike-to-warning, 24/10/2026).
4. Response (`src/common/schemas/response.ts`, `pagination.ts`):
   - Thành công: `{ success: true, data }` qua `toOk(x)`, schema `ok(itemSchema)`.
   - Lỗi: `{ success: false, error: { code, message } }`.
   - Danh sách: `{ items, page, limit, total, totalPages }` qua `paginated()` / `toPage()`, trần 100.
     Bảng tin, tìm kiếm, hồ sơ, tin của tôi, tin đã lưu, hội thoại và tin nhắn: phân trang con trỏ `{ items, nextCursor }` qua
     `cursorQuerySchema` / `cursorPaginated()` / `toCursorPage()` (`cursor.ts`) — trang theo số lặp hoặc sót khi tin
     mới chen lên đầu, và `total` là một lượt `COUNT` toàn bảng. Con trỏ hỏng → 400 `VALIDATION_ERROR`.
   - Response schema là ranh giới DTO. KHÔNG khai response bằng `z.any()` hay schema lỏng.
   - Giữ lại: mọi response mặc định `Cache-Control: no-store`, lỗi luôn `no-store`. Route công khai
     chỉ mở sau khi service trả kết quả, bằng `cacheFor(reply, CACHE_*, toOk(x))` — thời hạn nằm ở spec
     `category/regions` và `category/category-catalog` (khu vực một ngày, danh mục và mẫu hiện hành 5 phút,
     phiên bản mẫu mãi mãi).
5. Không hardcode chuỗi trạng thái. Trạng thái khai bằng `enum` trong `schema.prisma`; tầng HTTP khai
   lại tuple `as const`. Đổi enum thì đổi luôn tuple.
6. Truy vấn chỉ đọc → `select` đúng field cần. Không gọi Prisma trong vòng lặp (N+1). Field dùng để
   filter/sort phải có `@@index`. Prisma 7 chạy `include` thành nhiều câu SQL riêng (đo 11/10/2026):
   lượt đọc chạy ở MỌI request (tra phiên, quyền staff) viết `$queryRaw` có JOIN trong repository, có ca
   trong hợp đồng repository và được đếm câu SQL ở `tests/hot-paths.db.test.ts`; chỗ khác dùng `include`.
7. Không dùng `console.log`. Trong request dùng `request.log`; ngoài request dùng `logger`. Chữ ký
   pino: object trước, chuỗi sau. **Không log** mật khẩu, token, mã xác nhận, email đầy đủ, dấu thiết
   bị, nội dung tin nhắn.
8. Không commit `.env.*` thật hay secret. Chỉ commit `*.example` chứa placeholder.
9. `exactOptionalPropertyTypes`: input Zod `.optional()` đi qua `definedOnly()` trước khi vào Prisma.
10. Comment trong code viết tiếng Việt, chỉ giải thích **vì sao** — không thuật lại code làm gì.

## Luật riêng của Ghim (BẮT BUỘC)

Mỗi luật dưới đây là một cam kết ở TK phần 27; số trong ngoặc là phần TK.

11. **Một loại quyết định, một chủ** (30). Chỉ `screening` ghi kết quả máy, chỉ `review` ghi quyết
    định của người, chỉ `trust` ghi gậy, chỉ `listing` đổi trạng thái tin. Module khác đọc qua service
    của chủ hoặc nhận sự kiện — không `prisma.<bảng của module khác>.update` ở đâu cả.
12. **Tác động chéo đi qua outbox** ghi trong **cùng transaction** với thay đổi gốc (30). Bên nghe phải
    chịu được nhận trùng **và xử lại sự kiện cũ sau sự kiện mới**: bộ phát chạy lại mọi bên nghe của một sự kiện khi một
    bên ném, và nhiều tiến trình phát song song. Bên nghe của một cặp (khoá / mở, cấm / gỡ cấm, rời / vào, tắt / bật)
    coi sự kiện là tín hiệu "có đổi" và lấy chiều từ trạng thái hiện tại — ở `listing` đọc trong lô sau khi khoá dòng
    (`applyBatch` `prepare`), ở module khác chặn đầu bên nghe (change `fix-audit-listeners`). Gọi đồng bộ chỉ sáu chỗ (TK 30; hai chỗ sau thêm ở add-messaging: `messaging` hỏi `trust` mức để tính hạn mức hội thoại mới và hỏi `screening` bộ lọc cụm lúc gửi tin nhắn — chỉ đọc, không ghi chéo): `listing` hỏi `trust` hạn chế/hạn mức, `listing`
    gọi `screening` chấm chữ lúc gửi, mọi module hỏi `identity` "người này là ai", và chủ ảnh (`identity`,
    `listing`) gọi `media` xác nhận ảnh: `resolve` trước transaction lưu, `attach(tx)` trong transaction lưu — lưu hỏng
    thì ảnh vẫn "chưa xác nhận". Ngoài sáu chỗ đó chỉ có cửa **đọc** cho câu thông báo: bên nghe của `notification` hỏi
    `group`, `listing`, `screening`, `messaging`, và từ add-trust-notices `trust` (gậy, điểm gậy) và `review` (người xử
    việc nhóm, số việc đang chờ — N36) — không ghi chéo. Bảng `outbox_events`
    và `appendEvent(tx, type, payload)` ở `src/common/outbox/outbox.ts` đã có — hàm chỉ nhận `tx` nên
    không gọi được ngoài transaction. Bộ phát `src/common/outbox/dispatcher.ts` do `buildApp` dựng
    (`app.outbox`, đã nối bên nghe của mọi module), `server.ts` bật (10 giây/lượt, và một lượt sớm sau mỗi
    request ghi qua `kick()`), nhận lô bằng `FOR UPDATE SKIP LOCKED` kèm hạn giữ 60 giây, nên nhiều tiến trình chạy cùng
    lúc không phát trùng. Bên nghe ném thì sự kiện giữ lại, `attempts` + `last_error`, và
    `next_attempt_at` lùi dần (10 giây × 2^n, trần 1 giờ) — sự kiện hỏng không chặn sự kiện mới; từ lần
    thử thứ 10 lỗi lên `error`. Không bao giờ bỏ sự kiện: sửa xong nguyên nhân thì đặt
    `next_attempt_at = now()` là phát lại ngay. Bên nghe đăng ký ở `<module>.events.ts`, nối qua
    `listeners` của định nghĩa module (vd `platform.events.ts` treo quyền khi khoá, thu quyền khi xoá); bên nghe phải
    idempotent và **không dựa vào thứ tự** giữa các sự kiện. Sự kiện đã phát quá 30 ngày được việc
    `outbox.purge-published` (04:30 hằng ngày, `src/modules/ops/ops.jobs.ts` — chuyển từ `common/outbox` ở
    add-data-retention, tên giữ vì pg-boss lưu lịch theo tên) xoá; sự kiện chưa phát thì không. Hợp đồng bên nghe không đổi.
13. **Trạng thái tin, cờ tạm ẩn, lý do hạn chế là ba thứ riêng** (15, 18, 19). Lý do hạn chế là một
    tập (`machine`, `new_account`, `strike`), mỗi lý do đặt/gỡ độc lập. Đường chuyển trạng thái tin
    là **bảng thuần** trong `listing/calc/listing.calc.ts`, có unit test cho mọi mũi tên của sơ đồ TK
    phần 18 — và cho mọi mũi tên KHÔNG có.
14. **Máy không phạt** (13, nguyên tắc 7). `screening` chỉ trả `pass_full` / `pass_limited` / `hold`.
    Lỗi dịch vụ, quá giờ, thiếu kết quả ảnh → `hold`, không bao giờ là cho qua.
15. **Quá hạn không tự mở** (nguyên tắc 2, TK 26 luật 3). Không job nào được đặt một tin thành hiển
    thị. Quá hạn chỉ chuyển cấp; riêng việc lấy mẫu hậu kiểm được tự huỷ.
16. **Một tin, một việc mở** (16): partial unique trên bảng việc `WHERE` việc còn mở — không dựa vào
    service kiểm trước. Quyết định của người là **ghi có điều kiện** theo phiên bản tin lúc mở việc;
    tin đã đổi → 409, người xử tải lại. Mọi lượt ghi việc đi qua `withOpenTask` của `review.repository.ts`: khoá dòng
    tin (cổng `listing.lockForReview`) **trước** rồi mới khoá việc — đúng thứ tự của lượt đổi tin, không thì deadlock.
17. **Không ai, trừ master, xử việc của chính mình** (nguyên tắc 4) — kể cả tài khoản dùng chung
    thiết bị. Một hàm duy nhất trong `review` quyết ai được nhận việc (`canHandle` ở `review/calc/route.calc.ts`, loại
    người theo `excluded_ids` của việc); không viết `if (actor.id === listing.ownerId)` rải rác.
18. **Mức tin cậy là hàm thuần** của dữ kiện (`trust/calc/tier.calc.ts`, hạn mức ở `trust/calc/quota.calc.ts`), tính lại từ đầu chứ
    không cộng trừ, lưu kèm dấu băm dữ kiện và phiên bản bảng con số (20). Mỗi luật có unit test.
19. **Mọi con số ở TK phần 28 đọc từ bảng con số có phiên bản** (`platform`), không hardcode trong
    code. Kết quả máy và mức tin cậy ghi lại phiên bản đã dùng. Code đọc qua
    `RuntimeConfig.get('<module>.<khoá>')`; bản thật `createVersionedRuntimeConfig` (`platform`) giữ
    phiên bản hiện hành của `config_versions` trong bộ nhớ, làm mới sau 5 giây hoặc ngay khi chính
    tiến trình ghi. Thêm con số = thêm khoá vào `src/common/config/config-keys.ts` (kiểu, giá trị khởi
    đầu, nhóm TK 28, khoảng hợp lệ); lần khởi động kế tiếp tự tạo phiên bản mới (người tạo: hệ thống)
    thêm đúng khoá đó, nên mọi phiên bản luôn mang trọn bộ con số. Khoảng hợp lệ (design
    `fix-audit-security` mục 5): thời lượng dùng helper theo đơn vị (`days`, `hours`, `minutes`…, trần 100
    năm); sàn mặc định 1, khoá chỉ nhận `0` khi `0` có nghĩa "tắt / không chờ" và code chạy đúng với nó;
    code giả định thứ tự giữa hai khoá thì thêm một dòng vào `RELATIONS`. Con số đọc lúc đăng ký route
    hay plugin là bị đóng băng tới lần khởi động sau — luôn đọc `config.get` ở lượt dùng (vd `app.signAccessToken`).
    Test đè từng khoá bằng `createStaticRuntimeConfig({ … })`.
20. **Email**: chuẩn hoá (chữ thường, bỏ `+tag`, Gmail bỏ dấu chấm, `googlemail.com` → `gmail.com`)
    bằng **một** hàm trước khi so trùng và trước khi băm. Dấu băm là HMAC, khoá nằm ngoài DB (biến
    môi trường của module `identity`).
21. **Dấu thiết bị** (8): chỉ dùng chống gian lận, giữ 180 ngày. Response cho người duyệt chỉ có câu
    "dùng chung thiết bị với tài khoản X", **không bao giờ** có mã máy.
22. **Dữ liệu có hạn lưu** (25). Tạm giữ bằng chứng thắng mọi hạn lưu. Nhật ký quyết định giữ mãi
    nhưng không chứa nội dung tin. Mọi thay đổi dữ liệu do master / staff làm ghi một dòng
    `appendAudit(tx, entry)` trong **cùng transaction** (repository nhận `audit` như nhận `events`;
    service dựng dòng từ `Actor` qua `auditActor`). Trigger `audit_log_immutable` chặn DELETE luôn luôn, UPDATE chỉ
    cho `pseudonymizeAudit` (transaction đặt `ghim.anonymize = 'on'`, đổi đúng `target_id` / `details` — ẩn danh hoá
    gậy, add-data-retention); `details` chỉ mang mã và số. Chỉ `platform` có cửa đọc (`GET /ops/audit`, master).
23. **Giá** là `BigInt` đồng, không âm, qua `priceSchema` (`src/common/schemas/money.ts`). `0` = cho
    tặng. Không khai giá bằng `z.number()` trần.
24. **Thời gian**: thời điểm lưu `@db.Timestamptz(3)`. Việc "theo ngày" (nhắc lúc 9 giờ sáng) tính
    theo `Asia/Ho_Chi_Minh` — chép `src/common/time/time.ts` từ booking khi module đầu tiên cần,
    không dùng `new Date().getDate()` / `setHours()` trực tiếp. "Trong 24 giờ" là cửa sổ trượt, không
    phải ngày lịch.
25. **Không multi-tenant.** Không có `shopId`. Phạm vi xem theo nhóm ("chỉ thành viên", "nhóm công
    khai", "sàn chung") là luật của `listing` và `group`, đi qua **một** hàm quyết ai xem được tin
    (TK 19, cuối phần).

## Quy trình OpenSpec (BẮT BUỘC)

Bốn nơi, mỗi nơi trả lời một câu hỏi:

| Nơi                 | Trả lời                                                           |
| ------------------- | ----------------------------------------------------------------- |
| TK                  | Vì sao, ví dụ, từ điển — bản đọc cho người không làm kỹ thuật     |
| `openspec/changes/` | Hệ thống SẼ làm gì: luật của TK viết thành requirement + scenario |
| `openspec/specs/`   | Hệ thống ĐANG làm gì: chỉ hành vi đã có code và test              |
| `CLAUDE.md`         | Viết code thế nào: tầng, lỗi, response, migration, test           |

- **Làm một phần của TK**: change đã có sẵn proposal + specs (xem **Thứ tự change** ở mục Module).
  Trả lời các **Câu hỏi mở** trong proposal trước, rồi `/opsx:apply <tên>` → agent viết nốt design,
  tasks → **người dùng duyệt** → code → kiểm tra xanh → `/opsx:archive`. Không code khi chưa duyệt.
- **Đổi một luật**: sửa TK và delta spec của change tương ứng trong cùng một lượt. Luật đã archive thì
  sửa bằng một change mới (`/opsx:propose`). Chưa rõ nên làm gì thì `/opsx:explore`.
- **Không đổi hành vi** (refactor, công cụ, tài liệu, nâng phiên bản) → không cần change.
- Capability đặt theo module: `<module>/<capability>` (vd `identity/registration`). Hạ tầng dùng chung:
  `http/`, `runtime/`, `health/`. Đang có: `http/api-contract`, `health/health-check`,
  `runtime/environment-guard`, 8 capability của `identity/` (registration, sessions, profile,
  email-change, account-lock, account-deletion, device-registry, id-verification) — archive từ
  `add-identity` ngày 10/10/2026; 4 của `platform/` (master-accounts, staff-permissions, config-versions,
  audit-log) và 2 của `category/` (category-catalog, regions) — archive từ `add-platform-roles` và
  `add-categories` cùng ngày; 5 của `group/` (group-lifecycle, group-modes, membership, group-roles, badges) và 5
  của `notification/` (inbox, preferences, realtime, group-notices, group-announcements) — archive từ `add-groups`
  và `add-notification-core` ngày 11/10/2026 (`add-groups` thêm một requirement vào `identity/account-deletion`);
  2 của `media/` (image-storage, image-cleanup) — archive từ `add-media` cùng ngày (thêm requirement "Ảnh đại diện"
  vào `identity/profile`); 9 của `listing/` (drafts, submission, placement, lifecycle, editing, display-period,
  suspension, visibility, deletion) — archive từ `add-listings` ngày 12/10/2026 (thêm requirement vào `group/badges`,
  `identity/profile`, `media/image-storage`); 3 của `trust/` (trust-tiers, quotas, seller-dashboard) — archive từ
  `add-trust-tiers` cùng ngày (thêm requirement vào `group/group-roles`); 7 của `screening/` (machine-decision,
  risk-scoring, hard-gates, image-checks, banned-phrases, rule-management, explanations) — archive từ `add-screening`
  ngày 13/10/2026 (thêm requirement vào `identity/profile`, `trust/seller-dashboard`). Hạ tầng `use-cloudinary-storage`
  (archive 15/10/2026) chỉ sửa `media/image-storage`: chỗ chặn ảnh sai cỡ / loại, tải lại không lỗi, kho không trả lời
  → 503. 6 của `review/` (queues, task-handling, conflict-of-interest, decisions, group-escalation, post-review) —
  archive từ `add-review-queues` ngày 15/10/2026 (thêm requirement vào `group/group-lifecycle`, `group/membership`,
  `platform/staff-permissions`, `screening/rule-management`); `notify-missing-images` cùng ngày thêm vào
  `media/image-cleanup` requirement "Báo ảnh đang dùng mà mất khỏi kho" (N38, N39). `fix-audit-security` (đợt 1 sửa lỗi
  rà soát, archive 15/10/2026) sửa `identity/registration` (Google gặp đăng ký chưa xác nhận), `identity/sessions`
  (lớp thứ hai đã bật không thiết lập lại qua app), `platform/config-versions` (khoảng hợp lệ, thêm "Các con số giữ
  ràng buộc giữa nhau"), thêm "Master không bị xoá hay khoá" vào `platform/master-accounts` và "Quyền master với việc
  chỉ dùng ở bàn vận hành" vào `review/queues`. `fix-audit-stuck-data` (đợt 2 phần A, archive 15/10/2026) sửa `listing/lifecycle`,
  `listing/suspension`, `listing/editing` (lý do ẩn trên mọi đường ghi, tin rời nhóm hẳn không rút về nháp), `group/membership`
  (rời nhóm chỉ huỷ việc của tin bị ẩn), `group/group-roles` (thiếu chủ không chuyển riêng tư), `identity/account-deletion`
  (ẩn danh thay vì xoá cứng; thêm "Người dùng Google đã xoá tài khoản"). `fix-audit-image-checks` (đợt 2 phần B, archive
  15/10/2026) thêm "Mọi ảnh của lượt gửi đều được kiểm" vào `screening/image-checks`, "Quét lại lần hai sau thời gian chờ
  ảnh" vào `screening/banned-phrases`, sửa lưới an toàn của `screening/machine-decision` (một lần mỗi phiên bản).
  `fix-audit-listeners` (đợt 2 phần C, archive 15/10/2026) thêm luật "theo trạng thái hiện tại" vào `listing/suspension`,
  `group/group-roles`, `platform/staff-permissions`, `review/queues`. `fix-audit-screening-trust` (đợt 3 phần C, archive
  15/10/2026) thêm "Lỗi tạm thời của kho được kiểm lại ở lượt gửi sau" vào `screening/image-checks`, "Đổi cụm mức chắc
  đang bật cũng quét lại" vào `screening/banned-phrases`, ca lỗi lúc kết luận vào `screening/machine-decision`, hai
  requirement "theo trạng thái hiện tại" và "lần lượt" vào `trust/trust-tiers`. `fix-audit-review` (đợt 3 phần B, archive
  15/10/2026) thêm sáu requirement vào `review/queues` (người bị khoá, xoá tài khoản, theo trạng thái hiện tại, rời
  nhóm hẳn / bị cấm, theo đơn vị, nhắc master), "Một việc một quyết định" vào `review/task-handling`, "Tin đang tạm ẩn
  không bị lấy mẫu" vào `review/post-review`, "Tin còn việc chờ người duyệt không chuyển lên sàn chung được" vào
  `listing/suspension`. `fix-audit-identity` (đợt 3 phần A1, archive 15/10/2026) sửa "Làm mới phiên" của
  `identity/sessions` (30 giây ân hạn), thêm "Xin đổi email phải nhập lại mật khẩu" và "Đổi email xong báo email cũ và
  đăng xuất thiết bị khác" vào `identity/email-change`. `fix-audit-listing` (đợt 3 phần A2, archive 15/10/2026) thêm
  "Lượt ghi của người đăng không đè thay đổi của hệ thống" vào `listing/editing`, "Gửi tin đúng lúc tắt danh mục hay
  khoá tài khoản" vào `listing/suspension`, scenario tin chờ duyệt đã rời nhóm vào "Tin sống gồm những gì" của
  `trust/quotas`. `fix-audit-group` (đợt 3 phần A3, archive 16/10/2026) thêm "Mời lại khi lời mời còn chờ", "Danh sách
  lời mời đang chờ", "Danh sách người bị cấm" vào `group/membership`, "Nhận làm chủ khi đang bị cấm" vào
  `group/group-roles`, scenario "Hai lượt ghi chờ nhau" vào "Xung đột khi ghi đồng thời" của `http/api-contract`.
  `fix-audit-identity-low` (đợt 4 phần 1, archive 16/10/2026) thêm "Mở khoá trả tài khoản về trạng thái trước khi khoá"
  vào `identity/account-lock`, "Không ai duyệt giấy tờ của chính mình", "Hai người cùng duyệt một hồ sơ" vào
  `identity/id-verification`, "Staff không gỡ đánh dấu của chính mình" vào `identity/device-registry`, "Trần phiên đúng
  cả khi đăng nhập cùng lúc" vào `identity/sessions`. `fix-audit-group-low` (đợt 4 phần 2, archive 16/10/2026) thêm
  "Chủ nhóm bị xoá tài khoản giữa chừng", "Chủ bị khoá khi nhóm đang chuyển sang riêng tư" vào `group/group-roles`,
  "Huỷ kèm theo vẫn báo" vào `group/membership`, "Bật hiện tên nhóm khi đổi sang riêng tư" vào `group/group-modes`, "Xoá
  đơn vị thì xoá thông báo gửi riêng cho nó" vào `notification/group-announcements`. `fix-audit-trust-media-low` (đợt 4 phần 3,
  archive 16/10/2026) thêm "Lên T1 đúng lúc tin đang lên bảng" vào `listing/visibility`, "Tài khoản T3 vẫn được tính
  lại khi còn tin sạch chưa tính" vào `trust/trust-tiers`, "Ảnh đã xoá hẳn không còn để so trùng" vào
  `screening/image-checks`. `duplicate-image-first-wins` (archive 16/10/2026, từ lượt chạy khói trên dev)
  sửa "Ảnh trùng với tin của tài khoản khác là cổng cứng" của `screening/image-checks`: chỉ so với ảnh đã kiểm xong
  trước — người đăng trước thắng. `notify-listing-decisions` (archive 16/10/2026) tạo `notification/listing-notices`:
  báo người đăng khi máy giữ / rút tin về và khi người duyệt đạt, từ chối, gỡ, khôi phục; ai ký; câu nhắc không lộ lý
  do; những chuyện không báo. `fix-stale-group-notices` (archive 16/10/2026) thêm "Thông báo theo trạng thái hiện tại
  của nhóm" vào `notification/group-notices`: dòng ma trận N3, N6, N10–N14, N26–N28 chỉ viết khi câu còn đúng.
  `add-reports` (archive 16/10/2026) tạo `review/reports`, `review/report-auto-hide`, `review/reporter-score`; thêm
  "Có báo cáo đang mở vẫn tự xoá được tài khoản" vào `identity/account-deletion`, "Tin đang bị báo cáo vẫn xoá được"
  vào `listing/deletion`, "Đóng nhóm không huỷ báo cáo" vào `group/group-lifecycle`. `fix-web-api-contract`
  (archive 18/10/2026, từ lượt nối `ghim-app`) thêm "Trình duyệt gọi được mọi phương thức của API" và "Tài liệu khai cách xác
  thực của từng route" vào `http/api-contract`: route phiên tuỳ chọn (`authenticateOptional`) khai
  `security: optionalBearer` — thiếu thì SDK sinh từ tài liệu gọi ẩn danh cả khi đã đăng nhập.
  `add-join-request-status` (archive 18/10/2026, cũng từ lượt nối `ghim-app`) thêm "Người xin thấy đơn đang chờ của
  mình" vào `group/membership`: hồ sơ nhóm của người dùng mang `joinRequest`, hồ sơ quản trị và vận hành thì không.
  Ba change từ lượt nối `ghim-app` ngày 18/10/2026, code đã vào `main` cùng ngày, archive 22/10/2026:
  `add-price-offers` tạo `messaging/price-offers`, thêm "Hội thoại cho biết tin và người kia" vào
  `messaging/conversations`, "Báo đề nghị giá và câu trả lời" vào `notification/inbox`; `add-team-conversations` tạo
  `messaging/support-chat`, `messaging/group-admin-chat`, sửa ba requirement của `messaging/conversations` (một tin
  một người mua một hội thoại, người ngoài nhận "không tìm thấy", bộ lọc cụm từ cấm) và thêm hai, thêm requirement vào
  `messaging/blocking`, `messaging/conversation-deletion`, `notification/inbox`, `notification/realtime`;
  `add-activity-status` tạo `messaging/activity-status`, thêm "Công tắc hiện trạng thái hoạt động" vào
  `identity/profile`.
  `remove-two-factor` (23/10/2026, người dùng chốt bỏ lớp thứ hai; archive 24/10/2026) bỏ "Đăng nhập hai lớp cho master và staff", thêm "Bàn
  vận hành chỉ đòi phiên đăng nhập hợp lệ" vào `identity/sessions`; thay "Xin đổi email phải nhập lại mật khẩu" bằng "Xin
  đổi email chỉ đòi mật khẩu hiện tại" (`identity/email-change`), "Đúng một master" bằng "Hệ thống chỉ có một master"
  (`platform/master-accounts`); bỏ chữ lớp thứ hai khỏi `platform/staff-permissions`, `review/queues`.
  `add-trust-notices` (archive 24/10/2026) tạo `notification/trust-notices` (N49–N58), thêm N36 vào
  `notification/group-notices`. `add-me-staff-flag` thêm "Hồ sơ của tôi cho biết quyền staff" vào `identity/profile`. `add-image-quality-checks` thêm
  "Ảnh hỏng giữ cho người kèm cách sửa", "Đo chất lượng từng ảnh", "Luật chất lượng ảnh bật thì giữ cho người", "Ngưỡng
  chất lượng ảnh trong bảng con số" vào `screening/image-checks`, "Phiếu tải ảnh cho biết cạnh ngắn tối thiểu" vào
  `media/image-storage`; sửa hai requirement của `screening/hard-gates` và hai của `screening/explanations`.
  Bốn change từ lượt nối `ghim-app` ngày 25/10/2026, gộp qua PR #21 và archive cùng ngày: `add-saved-listings` tạo
  `listing/saved-listings` (danh sách theo bề mặt `saved` của luật "ai thấy một tin": giữ tin đã bán, hết hạn);
  `add-id-verification-status` thêm "Người nộp xem được hồ sơ của mình" vào `identity/id-verification`;
  `fix-group-task-report-scope` sửa "Người xử thấy báo cáo liên quan" của `review/reports` (bàn của nhóm chỉ thấy báo
  cáo thường về chính tin); `add-saved-searches` tạo `listing/saved-searches`, đổi chín thành mười nhóm ở
  `notification/inbox`, `notification/preferences`.
  Sáu change ngày 26/10/2026, gộp qua PR #22, #23 và archive qua PR #24: `add-feed-sort` sửa "Vị trí trên bảng tin",
  thêm "Sắp xếp theo giá" vào `listing/visibility`; `add-home-province` thêm "Tỉnh/thành của tôi" vào `identity/profile`;
  `add-screening-stats` tạo `screening/run-stats`; `add-help-content` tạo `platform/help-content`; `add-message-images`
  tạo `messaging/message-images`, sửa một requirement mỗi spec `messaging/conversations`, `media/image-storage`,
  `media/image-cleanup`; `add-screening-ops-reads` thêm "Từ khoá suy ra danh mục" vào `screening/rule-management`, sửa
  "Danh sách trắng ảnh mẫu của hãng" của `screening/image-checks`.
- Mỗi scenario là một ca test. Archive một change thì mọi scenario nó thêm phải đã có test.
- Luật cho từng artifact (trích TK, ghi status + `error.code`, con số là giá trị khởi đầu, test đi
  cùng nhóm task…) nằm ở `openspec/config.yaml`. Sửa luật ở đó, không chép vào đây.
- `pnpm run spec:validate` (`--strict`) nằm trong `pnpm run check` và CI.
- `.claude/skills/openspec-*` và `.claude/commands/opsx/` do `openspec update` sinh — không sửa tay.
  Skill gọi lệnh `openspec` trần nên CLI phải có trên PATH: nâng phiên bản thì đổi cả
  `package.json` lẫn bản global (`npm i -g @fission-ai/openspec@<bản>`), rồi `openspec update`.
- Lệnh mở rộng (`/opsx:new`, `/opsx:ff`, `/opsx:verify`…): `openspec config profile` rồi
  `openspec update`.

## Migration (Prisma)

- Đổi `schema.prisma` → `pnpm exec prisma format` → `pnpm exec prisma validate` →
  `pnpm exec prisma migrate dev --create-only --name <mô_tả_ngắn>` → **đọc SQL sinh ra** → sửa tay
  nếu cần → `pnpm db:migrate` → `pnpm exec prisma generate`. Commit cả schema lẫn thư mục migration.
- SQL sinh ra có `DROP COLUMN` / `DROP TYPE` / `DROP TABLE` cho một lần **đổi tên** là sẽ mất dữ
  liệu. Viết lại bằng `RENAME`.
- Partial index khai ngay trong schema (`where: raw("...")`). CHECK, EXCLUDE, trigger viết SQL tay
  trong migration, kèm comment `///` ở model; tên phải trùng tên Prisma sinh. Kiểm bằng
  `pnpm db:drift`: phải ra "No difference detected".
- `ALTER TYPE … ADD VALUE` để ở một file migration riêng.
- Migration có thể mất dữ liệu → tách nhiều bước (thêm cột nullable → backfill → set NOT NULL).
- CI và production chỉ chạy `pnpm db:deploy`. KHÔNG dùng `prisma db push` trên môi trường dùng chung.
  `prisma.config.ts` từ chối `migrate reset` / `migrate dev` / `db push` / `db seed` khi
  `NODE_ENV=production`.
- Checklist cho bảng mới nằm ở `.github/pull_request_template.md`.

## Môi trường

| Môi trường  | File env                                            | DB (tên bắt buộc)                                       |
| ----------- | --------------------------------------------------- | ------------------------------------------------------- |
| development | `.env.development` (mẫu `.env.development.example`) | `…_dev` — container `postgres`, cổng 5435               |
| test        | không có file: `vitest.config.ts` / CI              | `…_test` — container `postgres-test` (tmpfs), cổng 5436 |
| production  | biến của nền tảng deploy, hoặc `.env.production`    | không kết thúc bằng `_dev` / `_test`                    |

- App (`env.ts`) và Prisma CLI (`prisma.config.ts`) cùng gọi `databaseEnvironmentIssue`: `NODE_ENV`
  và hậu tố tên DB lệch nhau → từ chối khởi động. Không nới chốt này để "chạy tạm".
- Cổng app mặc định **3100**; Postgres 5435/5436 — booking giữ 3000 và 5433/5434. Dev còn cần Mailpit
  (`pnpm mail:up`, SMTP 1025 / hộp thư 8025) vì `SMTP_URL` bắt buộc ngoài test, và kho ảnh (`pnpm storage:up`, 9100) vì `STORAGE_URL` bắt buộc mọi nơi; bucket dev tự tạo lúc khởi động. Test cần `pnpm storage:test:up` (9110).
- Biến của `identity` (`JWT_SECRET`, `IDENTITY_HASH_KEY`, `SECRETS_ENCRYPTION_KEY`, `SMTP_URL`,
  `MAIL_FROM`, `GOOGLE_CLIENT_IDS`, `DISPOSABLE_DOMAINS_URL`): ý nghĩa và ràng buộc ở `env.ts`; test
  nhận giá trị giả từ `vitest.config.ts`, không từ file env.
- Mạng: `TRUST_PROXY` (`false` hoặc danh sách IP / CIDR / `uniquelocal` của proxy, `src/config/trust-proxy.ts`)
  và `CORS_ORIGIN` cụ thể là bắt buộc ở production; `true` và số hop bị từ chối mọi nơi (Fastify 5.12 không tin số
  hop). `x-request-id` từ ngoài chỉ được giữ khi khớp `[A-Za-z0-9._:-]{1,128}`.
- Pool chỉnh qua env: `DATABASE_POOL_MAX` (Prisma), `JOBS_POOL_MAX` (pg-boss). Ba trần thời gian là hằng số
  trong code — nhận request 30 giây (`app.ts`), chờ kết nối 5 giây và mỗi câu SQL 15 giây (`lib/prisma.ts`) —
  vì mặc định của Fastify và `pg` là chờ vô hạn. Chạm trần thì request rơi vào 500 `INTERNAL_ERROR`.
- Image chạy `node --enable-source-maps`. Băm mật khẩu dùng tham số mặc định của argon2 — chỉ chỉnh khi đo
  thấy nghẽn, không chỉnh theo phỏng đoán.

## Testing

- Vitest, file phẳng `tests/*.test.ts`. Env cho test khai trong `vitest.config.ts`, **không** có `.env.test`.
- **Mọi test chạy trên Postgres thật và kho ảnh thật** — `pnpm db:test:up` và `pnpm storage:test:up` một lần,
  rồi `pnpm test`. Máy không có Docker: `pnpm test:unit` chạy riêng test thuần (`*.calc.test.ts` và danh sách
  trong `vitest.unit.config.ts`), không cần DB. Không có repository giả:
  giữ bản giả khớp DB tốn hơn chạy DB, và nó từng lệch mà vẫn xanh (giờ ghi nhật ký lấy đồng hồ của app thay
  vì `now()` của DB). `tests/db-global-setup.ts` áp migration lên DB mẫu `ghim_test` rồi nhân bản một DB cho
  mỗi worker, nên các file vẫn chạy song song; `tests/db-worker-setup.ts` xoá sạch dữ liệu **đầu mỗi file**.
  Trong một file dữ liệu dồn qua các ca, nên mỗi ca dùng giá trị riêng (bộ đếm `seq`); ca cần DB trống thì
  file tự thêm `beforeEach(truncateAll)`. Kho cũng vậy: mỗi worker một bucket (`ghim-test-<lượt>-w<N>`), xoá sạch
  đầu mỗi file; `tests/storage-helpers.ts` dựng / dọn bucket và tải tệp bằng URL đã ký như app.
- HTTP test: `buildTestApp()` (`tests/test-app.ts`) — app thật trên repository thật; chỉ jobs (`runAll()`),
  mailer, đẩy lên điện thoại (`noopPush`) và đồng hồ là giả, để test tự quyết lúc việc nền chạy, đọc được thư, và "30 ngày sau" là một phép
  cộng — rồi `app.inject()`, không mở cổng. Dữ liệu nền qua `repositories.*`, quyền staff qua `grantStaff`,
  tài khoản + token bàn vận hành qua `tests/ops-helpers.ts`; đọc lại outbox / nhật ký qua `tests/db-helpers.ts`.
  Nhóm và thông báo: `tests/group-helpers.ts` dựng người dùng có token, nhóm đang hoạt động, thành viên, điều
  hành viên, đơn vị; `deliverAll(app)` chạy `app.outbox` tới khi hết sự kiện để bên nghe thật (thông báo) chạy
  đúng lúc test muốn. Realtime: `tests/realtime.test.ts` mở cổng thật (`app.listen({ port: 0 })`) và nối bằng
  `socket.io-client`. Ảnh: `tests/media-helpers.ts` xin quyền tải, tải thật lên kho test, đặt ảnh đại diện; test dọn
  ảnh dựng thêm một `media` service với `storageClock` đẩy tới trước để tệp vừa tải trông như đã cũ.
  Ca tranh chấp bọc repository thật (`{ ...repositories.identity, method: … }`, truyền qua
  `buildTestApp({ repositories })`) để giữ hai lượt ở đúng điểm.
  Tin đăng: `tests/listing-http-helpers.ts` đi luồng thật (nháp → ảnh → gửi → `machinePass`), `signedInAt` ký lại
  phiên khi ca đẩy đồng hồ quá 30 ngày. Mặc định của test là module `trust` thật (tài khoản mới ở T0, 3 lượt gửi mỗi
  giờ với đồng hồ đứng yên); test không bàn về mức hay hạn mức đè bằng `buildTestApp({ trust: createInterimTrust(…) })`.
  Máy duyệt mặc định cũng thật: lượt gửi chờ kết quả ảnh, và máy đọc cài đặt danh mục lúc chấm — `seedCategory`
  (`tests/listing-helpers.ts`) dựng danh mục kèm phiên bản cài đặt 1 như bàn vận hành. Test không bàn về máy duyệt đè
  bằng `buildTestApp({ screening: interimScreening })`; test máy duyệt dùng `tests/screening-helpers.ts` (`screened`
  ghi sẵn ảnh đã kiểm để lượt kết luận ngay, `tierPort` đặt mức từng người, `pngOf` sinh ảnh thật cho `sharp`) và
  gọi `app.modules.screening.ensureRules()` vì `buildTestApp` không chạy bước khởi động.
  Ca tranh chấp có khoá nhóm dùng cổng `trust` giả dừng lượt gửi trong transaction (`tests/listing-races.db.test.ts`);
  dữ liệu nền mức DB ở `tests/listing-helpers.ts`. Mức tin cậy: `seedTier` (`tests/group-helpers.ts`) ghi thẳng mức
  làm dữ liệu nền — `createActiveGroup` và `appointModerator` dùng nó vì nhận vai cần T1; luật lên mức đi luồng thật ở
  `tests/trust-tiers.http.test.ts`.
  Người duyệt: mọi lượt gửi tin của test dùng chung một mã máy (`DEVICE`), nên mọi người đã đăng tin đều "dùng chung
  thiết bị" với nhau — staff, điều hành viên, master trong `tests/review-*.http.test.ts` không đăng tin, trừ ca cố ý
  kiểm luật đó (máy riêng: ghi thẳng `device_posts`, hay `device_logins` cho ca chỉ đăng nhập). Job của `review` gọi thẳng `app.modules.review.everyMinute()`,
  `everyHour()`, `weeklyPostcheck()` với đồng hồ đẩy tay; tỉ lệ lấy mẫu đè bằng `config` của `buildTestApp`. Lý do
  mẫu khởi đầu: gọi `app.modules.review.ensureReasonTemplates()` — `truncateAll` xoá cả bảng, như `ensureRules`.
- `tests/*.db.test.ts`: test repository và ghi thẳng bằng Prisma để kiểm ràng buộc chỉ DB trả lời được
  (partial unique "một việc mở mỗi tin", CHECK, EXCLUDE), kiểm đúng mã lỗi (`prismaErrorCode` / `sqlStateOf`).
- Mỗi cam kết ở TK phần 27 thuộc đợt đang làm phải có test — kể cả các ca **thiếu, sai, hết chỗ,
  quá hạn** (TK 29).
- `pnpm run check` (typecheck + lint + test + spec:validate) và `pnpm run build` phải pass trước khi coi
  task hoàn thành.

## Quy trình khi generate code

1. Đổi hành vi thì phải có change OpenSpec đã được duyệt. Đọc proposal, specs, design, tasks của
   change, rồi module mẫu của booking, để bám convention. Cần hiểu vì sao một luật như vậy thì đọc
   phần TK mà proposal trích.
2. Nếu đổi `schema.prisma`: làm theo mục **Migration**.
3. `pnpm run lint:fix`, rồi `pnpm exec prettier --write <file đã sửa>`.
4. `pnpm run check`, có lỗi thì fix.
5. `pnpm run build`, và server build ra khởi động được (`pnpm start:local`).
6. KHÔNG tự ý cài thêm package ngoài `package.json` hiện có. Cần thì hỏi trước.

## Việc AI KHÔNG được tự ý làm

- Không xoá hay sửa migration đã apply. Sai thì tạo migration mới.
- Không chạy `pnpm db:reset` hay `db push --force-reset` trên DB không phải local hoặc test.
- Không đổi cấu trúc response API hiện có nếu không được yêu cầu rõ.
- Không tắt hay sửa rule lint để né lỗi.
- Không để máy duyệt từ chối, ra gậy hay hạ mức tin cậy; không để job nào tự mở tin.
- Không ghi vào bảng của module khác; không trả mã thiết bị hay email đầy đủ của người khác ra API.
- Không đổi một con số hay một luật của TK mà không có yêu cầu rõ — đổi TK trước, code theo sau.
