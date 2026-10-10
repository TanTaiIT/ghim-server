# Design

## Context

`add-identity` đã archive: có tài khoản với cột `role` (`user | master`), guard dùng chung ở
`src/common/auth/` (`authenticate`, `requireMaster`, `requireOps(scope)` với `OPS_SCOPES = support |
id_verification`), hai điểm nối chờ `platform` — `PrivilegeSource` (bản mặc định `noStaffPrivilegeSource`)
và `RuntimeConfig` (bản tĩnh mang 15 con số của `identity`) — cùng outbox chỉ-ghi (`appendEvents`), pg-boss
và kiểu repository có transaction. `identity` phát ba sự kiện outbox `identity.account.locked | unlocked |
deleted` nhưng chưa ai đọc. Động lực và câu hỏi mở đã chốt ở `proposal.md`; hành vi ở `specs/platform/*`.

Ràng buộc (CLAUDE.md): một loại quyết định một chủ, module khác không ghi bảng của `platform`; tác động chéo
qua outbox; mọi con số đọc qua `RuntimeConfig`; nhật ký giữ mãi, không chứa nội dung tin.

Change này làm chung một lượt với `add-categories` (vòng phụ thuộc danh mục ↔ quyền staff theo danh mục).
Bảng của cả hai module nằm trong một migration; archive `add-platform-roles` trước.

## Goals / Non-Goals

**Goals:**

- Bốn capability của `platform` chạy được và có test ở đúng tầng; `identity` đổi sang bản thật của
  `PrivilegeSource` và `RuntimeConfig` mà service của nó không đổi.
- Ba nền dùng chung mà đợt 1 còn thiếu: nhật ký (`appendAudit` cùng transaction), bộ phát outbox tối thiểu
  (để quyền staff tự treo khi tài khoản bị khoá), sổ đăng ký con số (registry) cho bảng có phiên bản.
- Hai công cụ chạy tay cho đội kỹ thuật: tạo master, đặt lại lớp thứ hai.

**Non-Goals:**

- Giao diện bàn vận hành; việc đang nhận trả về hàng chờ khi treo quyền (`add-review-queues`); treo vì gậy
  (`add-strikes`); kết quả máy ghi phiên bản (`add-screening`, `add-trust-tiers`); con số của hạn lưu và điểm
  dấu hiệu (change xây phần đó thêm khoá vào registry).
- Bộ phát outbox đầy đủ (nhiều tiến trình, dead-letter, giám sát) — `ops` đợt 7. Bản này đủ cho một tiến trình.

## Decisions

### 1. Hai module, một lượt, một migration

`platform` và `category` viết cùng lượt; `staff_category_grants.category_id` là FK tới `categories`, nên cả hai
bộ bảng vào một migration `init_platform_category`. `platform` kiểm "danh mục có tồn tại" bằng
`CategoryService.existingIds(ids)` — gọi đồng bộ chỉ đọc, đúng luật 12. Archive theo thứ tự CLAUDE.md:
`add-platform-roles` rồi `add-categories`.

_Thay thế đã cân nhắc:_ archive `add-categories` trước và để scenario "danh mục không tồn tại" chờ — làm
spec `staff-permissions` thiếu một scenario lúc archive, trái luật "archive thì mọi scenario đã có test".

### 2. Master là một cột đã có, công cụ chạy tay nằm ở `identity`

`accounts.role = master` do `identity` sở hữu nên lệnh tạo master và đặt lại lớp thứ hai là hai method của
`IdentityService` (`createMaster`, `resetTwoFactor`), gọi từ `src/cli/create-master.ts` và
`src/cli/reset-two-factor.ts` (chạy bằng `tsx`, đọc `.env.<NODE_ENV>` như app). `createMaster` từ chối khi đã
có một master hay email đã có tài khoản; tạo ở trạng thái `active` (đội kỹ thuật là người xác nhận). `platform`
chỉ sở hữu _luật_ "đúng một master" và cửa HTTP (không có cửa nào). Body gắn quyền staff khai `.strict()`:
gửi `role` là 400 `VALIDATION_ERROR` — không có đường nào nâng master qua HTTP.

### 3. Quyền staff: một dòng mỗi tài khoản, phạm vi thay cả gói

```
staff_permissions      account_id PK → accounts (cascade), scopes staff_scope[] (support | user_reports |
                       id_verification), status staff_permission_status (active | suspended),
                       suspended_reason?, suspended_at?, granted_by, granted_at, updated_at
staff_category_grants  (account_id → staff_permissions cascade, category_id → categories) PK
```

`PUT /ops/staff/:accountId` nhận **toàn bộ** phạm vi (`categoryIds[]`, `scopes[]`) và thay cả gói trong một
transaction — "phân quyền đầy đủ": master luôn nhìn thấy và gửi lên trọn phạm vi, không có thao tác cộng dồn
dễ quên. Rỗng cả hai → 400. Tài khoản phải là `user`, `active` (đã xác nhận email, không khoá); vi phạm → 409
`STAFF_PERMISSION_INELIGIBLE`. `DELETE` thu hẳn; `POST …/restore` chỉ khi đang `suspended` và tài khoản
`active`. Mọi thao tác ghi nhật ký cùng transaction.

Treo khi khoá: bên nghe `identity.account.locked` của bộ phát outbox gọi `platform.suspend(accountId,
'tài khoản bị khoá')` — idempotent (đã treo thì thôi). Mở khoá KHÔNG trả lại: `identity.account.unlocked`
không có bên nghe ở `platform`.

Hiệu lực ngay: `PrivilegeSource` đọc DB mỗi lần hỏi (một lượt tìm theo khoá chính, có index), không cache.

### 4. `PrivilegeSource` mở rộng, guard phân biệt "treo" và "không có"

Interface ở `src/common/auth/privilege-source.ts` thêm `permissionState(accountId): 'none' | 'active' |
'suspended'` và `hasCategoryScope(accountId, categoryId)`; `OPS_SCOPES` thêm `user_reports`. Guard
`requireOps(scope)` và guard mới `requireCategoryOps(categoryIdOf)` (đọc mã danh mục từ params): master qua;
`suspended` → 403 `STAFF_PERMISSION_SUSPENDED`; không có phạm vi → 403 `FORBIDDEN`; rồi lớp thứ hai như cũ.
`isStaff` trả `true` cho cả `suspended` (hai lớp và trần 3 phiên vẫn áp — proposal). Bản thật
`createPlatformPrivilegeSource(repository)` ở `platform`; bản mặc định `noStaffPrivilegeSource` giữ cho test.

### 5. Bảng con số: registry trong code, phiên bản trong DB, cache ngắn

```
config_versions  version int PK, values jsonb, note?, created_by (không FK), created_at
```

`src/common/config/config-keys.ts` là **sổ đăng ký**: mọi khoá hợp lệ với kiểu (`int` | `percent`),
giá trị khởi đầu TK 28 và nhóm TK. `RUNTIME_CONFIG_DEFAULTS` suy từ registry; `RuntimeConfigKey` là union khoá.
Mỗi phiên bản mang **trọn** sổ đăng ký, không chỉ các khoá từng được đổi: phiên bản thiếu khoá thì lúc đọc
phải lấy giá trị khởi đầu trong code, và đổi giá trị đó trong code sẽ âm thầm đổi nghĩa một phiên bản cũ.
Khởi động gọi `ensureConfigVersion`: bảng rỗng → phiên bản 1 = toàn bộ registry; phiên bản hiện hành thiếu
khoá nào của registry (phần mềm mới thêm con số) → phiên bản kế thêm đúng các khoá đó với giá trị khởi đầu,
kèm ghi chú liệt kê khoá. Hai lượt do hệ thống tạo có `created_by` là id rỗng
`00000000-0000-0000-0000-000000000000` và không có dòng nhật ký — không có người làm, nên cột không mang khoá
ngoại sang `accounts`. Hai tiến trình khởi động cùng lúc: PK chặn lượt sau, repository trả `null` thay vì
ném. Đổi:
`POST /ops/config { baseVersion, changes, note? }` → kiểm từng khoá (có trong registry, số, không âm, percent
0–100), `baseVersion` phải bằng phiên bản hiện hành (409 `CONFLICT`), tạo phiên bản kế = registry ⊕ hiện hành ⊕ changes,
ghi nhật ký cùng transaction. Không kiểm ràng buộc chéo (proposal).

Bản thật `createVersionedRuntimeConfig(repository)`: giữ phiên bản hiện hành trong bộ nhớ, làm mới sau 5
giây hoặc ngay khi chính tiến trình ghi phiên bản mới — "có hiệu lực ngay" trong một tiến trình, và trần 5
giây khi sau này chạy nhiều tiến trình. `get(key)` là đồng bộ như interface hiện có; bản thật nạp lần đầu
lúc khởi động (`load()`), nên `get` không bao giờ phải chờ DB.

Khoá theo nhóm TK 28 (giá trị khởi đầu trong registry): `identity.*` (15 khoá đã có), `device.*`
(`dataRetentionDays` 180), `trust.*` (T1/T2/T3 ngày + tin sạch, `maxCleanPer7Days` 3, `soldCleanAfterDays`
2), `quota.*` (tin sống, lượt gửi mỗi giờ, hội thoại mới mỗi ngày cho T0–T3, `outsiderLivePerGroup` 2),
`screening.*` (dải 30 / 60, 30 tin mẫu, 2 triệu, đăng dồn 10 / 30, ảnh 5 phút, dò cổng 3 lần / 24 giờ chờ
24 giờ, chạy thử 7 ngày), `review.*` (máy giữ 24 giờ, báo cáo 72, khiếu nại 7 ngày, hạn chế do máy 72, chuyển
từ nhóm 72, mẫu 7 ngày, nhận việc 10 phút, nhắc master 72 giờ), `postcheck.*` (100 / 20 / 5 / 5 %, báo dưới
80 %), `strike.*` (1 điểm 90 ngày, 2 điểm 180 ngày, khoá từ 3 điểm, khiếu nại 14 / 30 ngày, xem lại 2 năm),
`report.*` (10 mỗi giờ, 3 người / 3 máy / T1 / 24 giờ, −3, −6, mất quyền 30 ngày), `listing.*` (30 ngày, nhắc
7, gia hạn 7, +30, 6 ảnh), `group.*` (21, 7, 3 đơn, 14, 14, mã 6 ký tự, thiếu chủ 30 ngày). Tên khoá chốt lúc
viết registry; design không liệt kê từng khoá vì registry là nguồn chuẩn.

_Thay thế đã cân nhắc:_ mỗi khoá một dòng (`config_values(key, version)`) — tra một phiên bản thành một
truy vấn gộp, và "một phiên bản chứa cả hai thay đổi" phức tạp hơn một jsonb.

### 6. Nhật ký là hạ tầng dùng chung, `platform` sở hữu cửa đọc

```
audit_log  id uuidv7, actor_id → accounts, actor_role account_role, action text, target_type text,
           target_id text, reason?, details jsonb?, created_at
           index (actor_id, created_at) · (target_type, target_id, created_at) · (created_at)
```

Như `outbox_events`: không module nghiệp vụ nào sở hữu bảng; `src/common/audit/audit.ts` có `appendAudit(tx,
entry)` và các repository ghi nó **trong cùng transaction** với thay đổi — không ghi được thì rollback (spec
"500 và thay đổi không xảy ra"). `platform` sở hữu `GET /ops/audit` (chỉ master) với lọc `actorId`,
`targetType` + `targetId`, `from` – `to`, phân trang. Không có route sửa / xoá; thêm trigger SQL viết tay
`audit_log_immutable` chặn `UPDATE` / `DELETE` ở tầng DB (test DB kiểm SQLSTATE).

`identity` ghi nhật ký cho các thao tác bàn vận hành của nó: khoá, mở khoá, gỡ đánh dấu, quyết định giấy tờ,
thêm / bỏ miền dùng một lần — thêm tham số `audit` vào các method repository tương ứng (service dựng dòng từ
`Actor`). Hành động đặt tên `<module>.<đối tượng>.<việc>`; thao tác chỉ đọc và thao tác bị từ chối không ghi.
`details` chỉ mang mã (mã tin, mã danh mục, phiên bản), không bao giờ mang tiêu đề, mô tả, giá, ảnh.

### 7. Bộ phát outbox tối thiểu, một tiến trình

`src/common/outbox/dispatcher.ts`: `createOutboxDispatcher({ prisma, handlers })` với `register(type,
handler)` và `runOnce()` — đọc tới 100 sự kiện `published_at IS NULL` theo `created_at`, gọi mọi bên nghe của
loại đó, đánh dấu `published_at`; bên nghe ném thì giữ sự kiện, tăng `attempts`, ghi `last_error`, thử lại ở
lượt sau (hai cột mới trên `outbox_events`). `server.ts` chạy `runOnce` mỗi 10 giây bằng `setInterval` và dừng
khi tắt. Bên nghe phải idempotent (luật 12). Test gọi `runOnce()` thẳng.

Bên nghe đầu tiên: `platform` treo quyền staff khi `identity.account.locked`.

_Thay thế đã cân nhắc:_ `identity.lockAccount` gọi thẳng `platform.suspend` — vi phạm luật 12; đợi `ops`
đợt 7 — spec "tự treo ngay" không có cách kiểm. Dùng pg-boss cron — nhịp nhỏ nhất một phút, và thêm một hàng
đợi chỉ để gọi một hàm; `ops` quyết lại khi chạy nhiều tiến trình.

### 8. `buildApp` nhận thêm deps của `platform`, test có một helper dựng app toàn bản giả

`AppDeps` thêm `platformRepository`; mặc định `privilegeSource` và `config` là bản thật của `platform`, nên
mọi test HTTP phải truyền bản giả — thêm `tests/fakes/app.ts` (`buildTestApp(overrides)`) điền sẵn repository
giả của ba module, jobs giả, mailer giả, `noStaffPrivilegeSource` + bản giả có phạm vi, `createStaticRuntimeConfig`,
đồng hồ cố định. Test cũ của `identity` chuyển sang helper này trong cùng change.

### Dữ liệu — `platform` sở hữu `staff_permissions`, `staff_category_grants`, `config_versions`; `audit_log` dùng chung

| Bảng                    | Cột chính                                                                                                                                                          | Index / ràng buộc                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `staff_permissions`     | `account_id` PK, `scopes` `staff_scope[]`, `status` enum `staff_permission_status`, `suspended_reason?`, `suspended_at?`, `granted_by`, `granted_at`, `updated_at` | CHECK tay: `(status = 'suspended') = (suspended_at IS NOT NULL)`; `(status = 'suspended') = (suspended_reason IS NOT NULL)` |
| `staff_category_grants` | `account_id` → `staff_permissions` (cascade), `category_id` → `categories`                                                                                         | PK `(account_id, category_id)`; index `category_id`                                                                         |
| `config_versions`       | `version` int PK, `values` jsonb, `note?`, `created_by`, `created_at`                                                                                              | CHECK tay `version >= 1`                                                                                                    |
| `audit_log`             | `id`, `actor_id`, `actor_role` enum `account_role`, `action`, `target_type`, `target_id`, `reason?`, `details?` jsonb, `created_at`                                | 3 index trên; trigger tay `audit_log_immutable` (UPDATE / DELETE → raise)                                                   |
| `outbox_events` (+)     | thêm `attempts` int default 0, `last_error?`                                                                                                                       | —                                                                                                                           |

Enum mới: `staff_scope` (`support`, `user_reports`, `id_verification`), `staff_permission_status`
(`active`, `suspended`). `OPS_SCOPES` ở `common/auth` là tuple tương ứng.

### Quyết định và chủ sở hữu

| Quyết định                                | Chủ        | Cách module khác tác động                                                      |
| ----------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| Quyền staff (phạm vi, treo, trả lại, thu) | `platform` | `identity` hỏi qua `PrivilegeSource`; guard hỏi trước mỗi thao tác ops         |
| Phiên bản bảng con số                     | `platform` | mọi module đọc qua `RuntimeConfig`                                             |
| Đọc nhật ký                               | `platform` | mọi module ghi qua `appendAudit(tx, …)` trong transaction của mình             |
| Master (tạo, đặt lại lớp thứ hai)         | `identity` | công cụ `src/cli/*` gọi service của `identity`; `platform` giữ luật một master |
| Treo quyền khi khoá                       | `platform` | nghe `identity.account.locked` qua bộ phát outbox                              |

### Mã lỗi mới (tập đóng của change này)

403 `STAFF_PERMISSION_SUSPENDED` · 409 `STAFF_PERMISSION_INELIGIBLE`, `CONFLICT` (phiên bản con số lệch) ·
400 `VALIDATION_ERROR` (phạm vi rỗng, khoá lạ, số âm, phần trăm quá 100, `role` trong body) · 404 `NOT_FOUND`.

### Route (tiền tố `/api/v1`, mọi route `requireMaster`)

`GET /ops/staff?categoryId=` · `PUT /ops/staff/:accountId` · `DELETE /ops/staff/:accountId` ·
`POST /ops/staff/:accountId/restore` · `GET /ops/config` · `GET /ops/config/versions/:version` ·
`POST /ops/config` · `GET /ops/audit`. Công cụ chạy tay: `pnpm cli:create-master`, `pnpm cli:reset-2fa`.

## Risks / Trade-offs

- [Mỗi thao tác ops tra `staff_permissions` một lần] → Một lượt tìm theo khoá chính; cache là việc của ngày
  cần, và cache làm "thu có hiệu lực ngay" thành "trong N giây".
- [Bộ phát outbox là `setInterval` một tiến trình] → Đủ cho bản đầu (TK 30: một tiến trình); nhiều tiến trình
  thì `ops` thay bằng khoá theo hàng — hợp đồng bên nghe (idempotent, `attempts`) không đổi.
- [Registry con số lớn, khoá đặt tên lần đầu] → Tên khoá là hợp đồng với các change sau; chốt trong code của
  change này, mọi change sau đọc registry chứ không bịa tên.
- [`RuntimeConfig` cache 5 giây có thể trả phiên bản cũ ở tiến trình khác] → Hôm nay một tiến trình nên
  không xảy ra; ghi rõ ở CLAUDE.md.
- [Nhật ký không bao giờ xoá → bảng chỉ lớn] → Index theo thời gian và phân trang; dung lượng là chi phí đã
  chấp nhận ở cam kết 31.
- [Sự kiện outbox lỗi lặp vô hạn] → `attempts` + `last_error` để người trực thấy; dead-letter là của `ops`.

## Migration Plan

1. `prisma migrate dev --create-only --name init_platform_category`: tạo bảng của `platform` và `category`,
   enum mới, hai cột trên `outbox_events`, rồi viết tay CHECK và trigger `audit_log_immutable`. Không mất dữ
   liệu (chỉ thêm).
2. Khởi động: nạp phiên bản con số 1 nếu bảng rỗng; nạp khu vực nếu rỗng (`category`); bật bộ phát outbox.
3. Tạo master lần đầu: `pnpm cli:create-master --email <email> [--name <tên>]` với `MASTER_PASSWORD` trong
   env của lượt chạy;
   master đăng nhập, thiết lập lớp thứ hai, rồi mới mở được bàn vận hành.
4. Lùi: chưa có production; `migrate reset` trên DB dev.

## Open Questions

- Câu chữ lý do treo ("tài khoản bị khoá") và thông báo cho staff bị treo — chốt lúc viết service, không đổi
  spec.
