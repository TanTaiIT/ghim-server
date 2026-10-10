# Tasks

## 1. Schema và migration chung với `add-categories`

- [x] 1.1 Khai enum `staff_scope`, `staff_permission_status` và bảng `staff_permissions`, `staff_category_grants`, `config_versions`, `audit_log`, hai cột `attempts` / `last_error` trên `outbox_events` vào `prisma/schema.prisma` cùng các bảng của `category` (design của `add-categories`); xác minh `pnpm exec prisma format && pnpm exec prisma validate` qua
- [x] 1.2 Sinh migration `init_platform_category` bằng `migrate dev --create-only`, đọc SQL, thêm CHECK viết tay và trigger `audit_log_immutable`, comment `///` ở model; xác minh `pnpm db:migrate` áp được và `pnpm db:drift` ra "No difference detected"
- [x] 1.3 Viết `tests/platform.db.test.ts`: CHECK treo (status ↔ suspended_at / reason), PK `staff_category_grants`, FK sang `categories`, `version >= 1`, trigger từ chối UPDATE / DELETE trên `audit_log` (SQLSTATE); xác minh `pnpm test:db` xanh

## 2. Nền dùng chung

- [x] 2.1 `src/common/audit/audit.ts`: `AuditEntry` và `appendAudit(tx, entry)`; xác minh test DB ghi trong transaction bị rollback thì không còn dòng, commit thì đủ cột
- [x] 2.2 `src/common/outbox/dispatcher.ts`: `createOutboxDispatcher`, `register`, `runOnce` (100 sự kiện / lượt, idempotent, `attempts` + `last_error` khi bên nghe ném); nối `setInterval` 10 giây + dừng khi tắt vào `server.ts`; xác minh test DB: sự kiện được phát đúng một lần, bên nghe lỗi thì giữ lại với `attempts` 1
- [x] 2.3 `src/common/config/config-keys.ts`: registry mọi khoá TK 28 (kiểu, giá trị khởi đầu, nhóm) và `runtime-config.ts` suy `RUNTIME_CONFIG_DEFAULTS` + `RuntimeConfigKey` từ registry; xác minh unit test registry phủ đủ nhóm TK 28 và không khoá nào thiếu kiểu
- [x] 2.4 Mở rộng `src/common/auth/privilege-source.ts` (`user_reports`, `permissionState`, `hasCategoryScope`) và `auth.plugin.ts` (`requireOps` phân biệt treo / không có, guard mới `requireCategoryOps`); xác minh `tests/auth.http.test.ts` thêm ca 403 `STAFF_PERMISSION_SUSPENDED` và ca `requireCategoryOps`
- [x] 2.5 `tests/fakes/app.ts` (`buildTestApp` điền sẵn mọi bản giả) và chuyển các test HTTP hiện có của `identity` sang dùng nó; xác minh `pnpm test` xanh với `buildApp` mặc định là bản thật của `platform`

## 3. Module `platform`: repository, service, bản giả

- [x] 3.1 `platform.repository.ts` (`createPlatformRepository(prisma)`: quyền staff + grants trong transaction kèm nhật ký, phiên bản con số, treo, đọc nhật ký có lọc) và `tests/fakes/platform-repository.fake.ts` cùng hình dạng; xác minh unit test bản giả giữ PK / unique như DB
- [x] 3.2 `platform.service.ts`: `grantStaff` (thay cả gói, kiểm tài khoản `user` + `active`, kiểm danh mục qua `category`), `revokeStaff`, `restoreStaff`, `suspendStaff`, `listStaff`, `createPlatformPrivilegeSource`; xác minh unit test với repository giả phủ mọi scenario của spec `staff-permissions` kể cả 409 `STAFF_PERMISSION_INELIGIBLE` và 403 `STAFF_PERMISSION_SUSPENDED`
- [x] 3.3 Bảng con số: `ensureConfigVersion`, `getCurrent`, `getVersion`, `changeConfig` (kiểm khoá / kiểu / không âm / percent, 409 khi `baseVersion` lệch, nhật ký cùng transaction) và `createVersionedRuntimeConfig` (cache 5 giây, làm mới khi ghi); xác minh unit test mọi scenario của spec `config-versions` và test DB phiên bản 1 mang giá trị TK 28 sau khi nạp
- [x] 3.4 Đọc nhật ký: `queryAudit` theo người làm / đối tượng / khoảng thời gian, phân trang; xác minh unit test lọc đúng và xếp theo thời gian

## 4. Route bàn vận hành của `platform`

- [x] 4.1 `platform.schema.ts` (body gắn quyền `.strict()`, lọc nhật ký, đổi con số) và `platform.ops.routes.ts`: `/ops/staff*`, `/ops/config*`, `/ops/audit` với `requireMaster`; xác minh `tests/platform.http.test.ts` phủ mọi scenario HTTP của bốn spec: staff 403, master nâng master → 400, danh sách lọc theo danh mục, thu có hiệu lực ngay, phiên bản 404, hai phiên cùng sửa → 409, staff tra nhật ký → 403
- [x] 4.2 Tag Swagger `Ops · Staff`, `Ops · Config`, `Ops · Audit`; xác minh `/docs/json` liệt kê đủ route với `bearerAuth`

## 5. Nối với `identity`

- [x] 5.1 `identity` ghi nhật ký cho khoá, mở khoá, gỡ đánh dấu, quyết định giấy tờ, thêm / bỏ miền dùng một lần (tham số `audit` trên repository, service dựng dòng từ `Actor`); xác minh test HTTP hiện có thêm assert dòng nhật ký (repository giả) và test DB "không ghi được nhật ký thì khoá không xảy ra"
- [x] 5.2 Bên nghe `identity.account.locked` → `platform.suspendStaff`; mở khoá không trả lại; xác minh test DB qua `runOnce()`: staff bị khoá thành "đang treo" với lý do, mở khoá vẫn treo, master trả lại đúng phạm vi
- [x] 5.3 `identity.service.createMaster` / `resetTwoFactor` và `src/cli/create-master.ts`, `src/cli/reset-two-factor.ts` + script `cli:create-master`, `cli:reset-2fa` trong `package.json`; xác minh unit test: email trùng → từ chối, master thứ hai → từ chối, đặt lại lớp thứ hai gỡ bí mật và thu hồi phiên; chạy tay CLI trên DB dev tạo được master rồi đăng nhập được
- [x] 5.4 `buildApp`: `privilegeSource` và `config` mặc định là bản thật của `platform`, `server.ts` nạp phiên bản con số 1 và bật bộ phát outbox; xác minh `pnpm start:local` lên, `/health/ready` up, `config_versions` có phiên bản 1

## 6. Tài liệu

- [x] 6.1 CLAUDE.md: module `platform` đang có, luật 12 (bộ phát outbox tối thiểu đã có, `ops` nhận lại), luật 19 (`RuntimeConfig` bản thật + registry), nhật ký (`appendAudit`), `PrivilegeSource` đã nối, mục `cli/`; README: hai lệnh CLI và bước tạo master lần đầu; `tests/README.md` thêm file test mới; xác minh `pnpm run format:check`

## 7. Sửa sau rà soát (10/10/2026)

- [x] 7.1 Ba con số TK 28 của `identity` (hạn access token, trần gọi route khách mỗi phút, hạn cookie phiên) đọc ở mỗi lượt thay vì một lần lúc đăng ký route: `signAccessToken` trong `auth.plugin.ts`, trần gọi là hàm; xác minh `tests/platform.http.test.ts`: đổi hạn access token qua `/ops/config` thì lượt đăng nhập kế tiếp nhận hạn mới
- [x] 7.2 Mọi phiên bản con số mang trọn sổ đăng ký: `ensureConfigVersion` (bảng rỗng → phiên bản 1; phiên bản hiện hành thiếu khoá → phiên bản kế do hệ thống tạo, không nhật ký), `changeConfig` ghi trọn bộ, hai lượt ghi chen nhau trả `null` thay vì ném; xác minh unit test thiếu khoá và test DB hai tiến trình khởi động cùng lúc

## 8. Kiểm tra tích hợp

- [x] 8.1 `pnpm run check` xanh
- [x] 8.2 `pnpm test:db` xanh và `pnpm db:drift` ra "No difference detected"
- [x] 8.3 `pnpm run build` rồi `pnpm start:local`: tạo master bằng CLI, đăng nhập, thiết lập hai lớp, gắn quyền staff cho một tài khoản thật qua `/docs`, khoá tài khoản đó và thấy "đang treo" trong danh sách, đổi một con số và tra lại phiên bản 1

## Workflow follow-up

- Archive `add-platform-roles` sau khi người dùng duyệt kết quả và ba mục kiểm tra tích hợp qua, rồi archive
  `add-categories` ngay sau (`/opsx:archive`).
- Sau archive: `pnpm exec prettier --write openspec` rồi `pnpm run spec:validate`.
