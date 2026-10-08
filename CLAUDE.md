# CLAUDE.md — Ghim (bản làm lại)

> File này mô tả code **như nó đang là** (đối chiếu `package.json` và `src/` ngày 08/10/2026).
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
    `@fastify/swagger` + `@fastify/swagger-ui` (`/docs`, tắt ở production).
  - Đã cài, **chưa nối** (chờ module `identity`): `@fastify/jwt`, `@fastify/cookie`, `argon2`.
- DB: **PostgreSQL 18 + Prisma 7**, driver adapter `@prisma/adapter-pg`, preview `partialIndexes`.
  - `prisma/schema.prisma` là nguồn sự thật của schema đang chạy. **Chưa có model nào.**
  - Chuỗi kết nối nằm ở `prisma.config.ts`, KHÔNG nằm trong `datasource` của schema.
  - Client: **đúng một instance** ở `src/lib/prisma.ts`.
- Validation + OpenAPI: **Zod 4** + `fastify-type-provider-zod` — một schema cho validate, kiểu
  TypeScript và Swagger.
- Env: `src/config/env.ts` (Zod, fail fast). Chỉ khai biến code đang dùng.
- Logger: **pino** (`src/lib/logger.ts`), dev dùng `pino-pretty`.
- Test: **Vitest**, HTTP qua `app.inject()`. `pnpm test` không chạm DB; `pnpm test:db` chạy trên
  Postgres thật (container `postgres-test`).
- Lint/format: **oxlint + Prettier** (không phải ESLint). Không tự đổi rule.
- Spec-driven: **OpenSpec 1.14.1** (`@fission-ai/openspec`, ghim cứng phiên bản), lệnh `/opsx:*` —
  xem mục **Quy trình OpenSpec**.
- Skill cho agent: `.claude/skills/openspec-*` và `.claude/commands/opsx/` (sinh bởi
  `openspec update`), `.claude/skills/prisma-*` (nguồn `skills-lock.json`, chép từ booking).
- **(chưa có)** — phải hỏi trước vì cần chọn thư viện / dịch vụ:
  - Job nền thay agenda (TK 26). Chạy trên Postgres, idempotent, khoá trùm cả lượt chạy.
  - Realtime cho nhắn tin (hệ thống cũ dùng socket.io).
  - Gửi email (mã xác nhận), đăng nhập Google, kho ảnh + chữ ký tải thẳng, push (FCM), DeviceCheck
    của Apple, kiểm ảnh nhạy cảm, theo dõi lỗi (hệ thống cũ dùng Sentry).
  - **Không có SMS** — TK quyết định số 7.

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
  app.ts                      ← buildApp(): plugin, đăng ký route
  server.ts
  config/{env,database-guard}.ts
  lib/{prisma,logger}.ts
  common/
    errors/{app-error,error-handler}.ts
    plugins/swagger.ts
    schemas/{response,pagination,money}.ts   ← money.ts chỉ có `priceSchema`
    utils/defined.ts
  modules/<module>/
    <module>.routes.ts        ← route + schema (body/params/querystring/response) + guard
    <module>.service.ts       ← business logic
    <module>.repository.ts    ← toàn bộ truy vấn Prisma, kể cả transaction
    <module>.schema.ts        ← Zod schema + hằng/tập giá trị của module
    <module>.calc.ts          ← (nếu có) hàm tính toán thuần, không chạm DB
  cli/                        ← (chưa có) script chạy tay, vd tạo master
tests/*.test.ts               ← phẳng, không chia thư mục con; không chạm DB
tests/*.db.test.ts            ← chạy trên Postgres thật (`pnpm test:db`), tiện ích ở `tests/db-helpers.ts`
```

- **Không có tầng controller**: handler trong `routes.ts` gọi service rồi trả response.
- **Không có `<module>.types.ts`**: DTO chính là response schema Zod trong `<module>.schema.ts`.
- Tên module kebab-case, **số ít**. Đang có: `health`.

### Module theo TK phần 30 — thứ tự xây theo TK phần 29

| Đợt  | Module         | Phần TK    | Sở hữu (chỉ module này được GHI)                                                   |
| ---- | -------------- | ---------- | ---------------------------------------------------------------------------------- |
| 1    | `identity`     | 7, 8       | Tài khoản, email chuẩn hoá + dấu băm, phiên đăng nhập, Google, 2 lớp, dấu thiết bị |
| 1    | `platform`     | 5, 6, 28   | Master, quyền staff theo danh mục, **bảng con số có phiên bản**                    |
| 1    | `group`        | 9, 10      | Nhóm, chế độ, thành viên + đường vào, huy hiệu, đơn vị con, chủ nhóm               |
| 1    | `category`     | 11         | Danh mục, mẫu thông tin, trần giá, giá tham chiếu, mức rủi ro                      |
| 2    | `media`        | 25         | Ảnh, nhãn "chưa xác nhận", dọn ảnh (kiểm ảnh thuộc `screening`)                    |
| 2    | `listing`      | 12, 18, 19 | **Trạng thái tin**, nháp, nơi đăng, ngày hiển thị, cờ tạm ẩn                       |
| 2, 5 | `trust`        | 20, 21, 22 | Mức tin cậy, hạn mức, tin sạch (đợt 2); gậy, khiếu nại, ân xá (đợt 5)              |
| 3    | `screening`    | 13, 14     | **Kết quả máy**, cụm từ cấm, luật + trọng số, kiểm ảnh, lý do hạn chế `machine`    |
| 4    | `review`       | 16, 17, 23 | **Việc** và hàng chờ, nhận việc 10 phút, quyết định của người, hậu kiểm, báo cáo   |
| 6    | `messaging`    | 24         | Hội thoại, tin nhắn, chặn người                                                    |
| 6    | `notification` | 24         | Hộp thư, đẩy thông báo, nhóm bật/tắt                                               |
| 7    | `ops`          | 25, 26     | Outbox dispatcher, job theo lịch, dọn dữ liệu, tạm giữ bằng chứng                  |

`media` lên đợt 2 (TK 29 xếp ở đợt 3) vì nháp tin đăng đã cần ảnh; chỉ phần **kiểm** ảnh ở đợt 3.
Endpoint của bàn vận hành nằm trong module sở hữu dữ liệu, đăng ký dưới tiền tố `/api/v1/ops/...` —
không có module `ops-*` gom route của người khác.

**Thứ tự change — làm và archive đúng thứ tự này** (change sau thêm requirement vào capability của
change trước): đợt 1 `add-identity` → `add-platform-roles` → `add-groups` → `add-categories` · đợt 2
`add-media` → `add-listings` → `add-trust-tiers` · đợt 3 `add-screening` · đợt 4 `add-review-queues` →
`add-reports` · đợt 5 `add-strikes` · đợt 6 `add-messaging` → `add-notifications` · đợt 7
`add-data-retention`.

- `add-platform-roles` và `add-categories` cần nhau (quyền staff gắn theo danh mục; danh mục cần staff soạn
  mẫu): làm chung một lượt, archive theo thứ tự trên.
- Việc chạy theo lịch đã cần từ đợt 1 (dọn đăng ký dở dang, nhóm thiếu chủ quá 30 ngày) dù `ops` ở đợt 7:
  chọn thư viện job nền trước khi làm đợt 1.

Module mẫu để bám theo: chưa có trong repo này. Bám `../booking/src/modules/customer/` (repository,
service thuần, route có guard) và `../booking/src/modules/admin-shop/` (transaction nhiều bước +
nhật ký trong cùng transaction) — bỏ phần `shopId`, Ghim không multi-tenant.

## Quy tắc code chung (BẮT BUỘC)

1. Tầng `route → service → repository → Prisma`. Route không chứa nghiệp vụ; service không thấy
   `request`/`reply` và không import Prisma; repository không chứa luật nghiệp vụ.
   Ghép bằng factory: `createXRepository(prisma)` → `createXService(repo, …)`. Test dựng
   repository giả cùng hình dạng.
2. Mọi route khai `schema` (body / params / querystring / response) bằng Zod.
3. Mọi lỗi throw qua `AppError` hoặc subclass trong `src/common/errors/app-error.ts`. Chỉ
   `src/common/errors/error-handler.ts` map lỗi sang HTTP, kể cả lỗi Prisma (`PRISMA_ERRORS`:
   `P2002` → 409, `P2025` → 404, `P2003` → 409) và lỗi Postgres qua driver adapter (`P2039`, map theo
   SQLSTATE ở `POSTGRES_ERRORS`: `23P01`, `23514` → 409). Cần thêm mã thì thêm vào bảng đó.
   Thông báo lỗi cho người dùng viết tiếng Việt, ngắn, nói cách sửa. Lỗi tự sửa được thì nói cụ thể;
   **dấu hiệu gian lận thì không** — chỉ "đang chờ người duyệt" (TK nguyên tắc 8).
4. Response (`src/common/schemas/response.ts`, `pagination.ts`):
   - Thành công: `{ success: true, data }` qua `toOk(x)`, schema `ok(itemSchema)`.
   - Lỗi: `{ success: false, error: { code, message } }`.
   - Danh sách: `{ items, page, limit, total, totalPages }` qua `paginated()` / `toPage()`, trần 100.
     Bảng tin, tìm kiếm, tin nhắn sẽ cần phân trang cursor — **(chưa có)** helper.
   - Response schema là ranh giới DTO. KHÔNG khai response bằng `z.any()` hay schema lỏng.
5. Không hardcode chuỗi trạng thái. Trạng thái khai bằng `enum` trong `schema.prisma`; tầng HTTP khai
   lại tuple `as const`. Đổi enum thì đổi luôn tuple.
6. Truy vấn chỉ đọc → `select` đúng field cần. Không gọi Prisma trong vòng lặp (N+1). Field dùng để
   filter/sort phải có `@@index`.
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
    chịu được nhận trùng. Gọi đồng bộ chỉ ba chỗ: `listing` hỏi `trust` hạn chế/hạn mức, `listing`
    gọi `screening` chấm chữ lúc gửi, mọi module hỏi `identity` "người này là ai". **(chưa có)** bảng
    outbox và dispatcher (`ops`).
13. **Trạng thái tin, cờ tạm ẩn, lý do hạn chế là ba thứ riêng** (15, 18, 19). Lý do hạn chế là một
    tập (`machine`, `new_account`, `strike`), mỗi lý do đặt/gỡ độc lập. Đường chuyển trạng thái tin
    là **bảng thuần** trong `listing.calc.ts` **(chưa có)**, có unit test cho mọi mũi tên của sơ đồ TK
    phần 18 — và cho mọi mũi tên KHÔNG có.
14. **Máy không phạt** (13, nguyên tắc 7). `screening` chỉ trả `pass_full` / `pass_limited` / `hold`.
    Lỗi dịch vụ, quá giờ, thiếu kết quả ảnh → `hold`, không bao giờ là cho qua.
15. **Quá hạn không tự mở** (nguyên tắc 2, TK 26 luật 3). Không job nào được đặt một tin thành hiển
    thị. Quá hạn chỉ chuyển cấp; riêng việc lấy mẫu hậu kiểm được tự huỷ.
16. **Một tin, một việc mở** (16): partial unique trên bảng việc `WHERE` việc còn mở — không dựa vào
    service kiểm trước. Quyết định của người là **ghi có điều kiện** theo phiên bản tin lúc mở việc;
    tin đã đổi → 409, người xử tải lại.
17. **Không ai, trừ master, xử việc của chính mình** (nguyên tắc 4) — kể cả tài khoản dùng chung
    thiết bị. Một hàm duy nhất trong `review` quyết ai được nhận việc; không viết
    `if (actor.id === listing.ownerId)` rải rác.
18. **Mức tin cậy là hàm thuần** của dữ kiện (`trust.calc.ts` **(chưa có)**), tính lại từ đầu chứ
    không cộng trừ, lưu kèm dấu băm dữ kiện và phiên bản bảng con số (20). Mỗi luật có unit test.
19. **Mọi con số ở TK phần 28 đọc từ bảng con số có phiên bản** (`platform`), không hardcode trong
    code. Kết quả máy và mức tin cậy ghi lại phiên bản đã dùng. Trong test thì dựng bảng con số giả.
20. **Email**: chuẩn hoá (chữ thường, bỏ `+tag`, Gmail bỏ dấu chấm, `googlemail.com` → `gmail.com`)
    bằng **một** hàm trước khi so trùng và trước khi băm. Dấu băm là HMAC, khoá nằm ngoài DB (biến
    môi trường của module `identity`).
21. **Dấu thiết bị** (8): chỉ dùng chống gian lận, giữ 180 ngày. Response cho người duyệt chỉ có câu
    "dùng chung thiết bị với tài khoản X", **không bao giờ** có mã máy.
22. **Dữ liệu có hạn lưu** (25). Tạm giữ bằng chứng thắng mọi hạn lưu. Nhật ký quyết định giữ mãi
    nhưng không chứa nội dung tin.
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
  `runtime/environment-guard`.
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

| Môi trường  | File env                                                       | DB (tên bắt buộc)                                       |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| development | `.env.development` (mẫu `.env.development.example`)            | `…_dev` — container `postgres`, cổng 5435               |
| test        | không có file: `vitest.config.ts` / `vitest.db.config.ts` / CI | `…_test` — container `postgres-test` (tmpfs), cổng 5436 |
| production  | biến của nền tảng deploy, hoặc `.env.production`               | không kết thúc bằng `_dev` / `_test`                    |

- App (`env.ts`) và Prisma CLI (`prisma.config.ts`) cùng gọi `databaseEnvironmentIssue`: `NODE_ENV`
  và hậu tố tên DB lệch nhau → từ chối khởi động. Không nới chốt này để "chạy tạm".
- Cổng app mặc định **3100**; Postgres 5435/5436 — booking giữ 3000 và 5433/5434.

## Testing

- Vitest, file phẳng `tests/*.test.ts`. Env cho test khai trong `vitest.config.ts` /
  `vitest.db.config.ts`, **không** có `.env.test`.
- Suite mặc định **không chạm DB**: service test dùng repository giả; HTTP test dùng `buildApp()` +
  `app.inject()`, không mở cổng.
- Test DB: `tests/*.db.test.ts`, chạy bằng `pnpm db:test:up` rồi `pnpm test:db`. Ràng buộc chỉ DB trả
  lời được (partial unique "một việc mở mỗi tin", CHECK, EXCLUDE) phải có test ở đây, kiểm đúng mã lỗi
  (`prismaErrorCode` / `sqlStateOf` trong `tests/db-helpers.ts`).
- Mỗi cam kết ở TK phần 27 thuộc đợt đang làm phải có test — kể cả các ca **thiếu, sai, hết chỗ,
  quá hạn** (TK 29).
- `pnpm run check` (typecheck + lint + test + spec:validate), `pnpm test:db` và `pnpm run build` phải
  pass trước khi coi task hoàn thành.

## Quy trình khi generate code

1. Đổi hành vi thì phải có change OpenSpec đã được duyệt. Đọc proposal, specs, design, tasks của
   change, rồi module mẫu của booking, để bám convention. Cần hiểu vì sao một luật như vậy thì đọc
   phần TK mà proposal trích.
2. Nếu đổi `schema.prisma`: làm theo mục **Migration**.
3. `pnpm run lint:fix`, rồi `pnpm exec prettier --write <file đã sửa>`.
4. `pnpm run check` và `pnpm test:db`, có lỗi thì fix.
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
