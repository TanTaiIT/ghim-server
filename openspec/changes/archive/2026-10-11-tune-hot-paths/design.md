# Design

## Context

Đo bằng log truy vấn của Prisma trên Postgres test (11/10/2026): `findUnique({ include })` chạy hai câu SQL
riêng — một cho bảng chính, một cho quan hệ. Trước change này:

| Đường                   | Câu SQL trước handler                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| Request có đăng nhập    | 2 (tra phiên, rồi tra tài khoản)                                            |
| Request bàn vận hành    | 6 (2 như trên + `permissionState` 2 + `hasStaffScope`/`hasCategoryScope` 2) |
| Đăng nhập, đã bật 2 lớp | hỏi "có phải staff" 2 lần, mỗi lần 2 câu                                    |

## Goals / Non-Goals

**Goals**: mỗi lượt đọc trên đường xác thực là một câu SQL; không đổi hành vi; bản giả và Postgres trả giống
nhau cho các lượt đọc mới.

**Non-Goals**: bật preview `relationJoins` của Prisma (đổi cách chạy mọi `include` trong app cùng lúc, còn
preview); cache quyền trong bộ nhớ (thu quyền phải có hiệu lực ngay — spec staff-permissions).

## Decisions

### 1. Hai lượt đọc nóng viết SQL tay, có JOIN

- `IdentityRepository.findActorSession(sessionId)`: `sessions JOIN accounts`, trả đúng các cột
  `resolveActor` cần (phiên, vai, trạng thái, lý do khoá).
- `PlatformRepository.findStaffGrant(accountId)`: `staff_permissions LEFT JOIN staff_category_grants` với
  `array_agg(category_id) FILTER (WHERE … IS NOT NULL)`, trả `{ status, scopes, categoryIds }`.

`$queryRaw` có tham số (không nối chuỗi), ép `::text` cho enum, `::uuid` cho tham số. Lệch giữa SQL tay và
bản giả được canh bằng hợp đồng repository (cùng ca chạy trên hai phía); `tests/hot-paths.db.test.ts` đếm câu
SQL thật để chặn việc quay về `include`.

_Thay thế đã cân nhắc:_ preview `relationJoins` — sạch hơn về kiểu nhưng đổi toàn app và còn preview; giữ
`include` — không bớt được câu nào.

### 2. `PrivilegeSource` còn một phương thức

`staffGrant(accountId): Promise<StaffGrantView | null>` với `StaffGrantView { status, scopes, categoryIds }`.
Guard `requireOps` / `requireCategoryOps` hỏi một lần rồi kiểm phạm vi trong bộ nhớ; `identity` coi "khác
`null`" là staff (hai lớp, trần 3 phiên — kể cả đang treo). Ba phương thức cũ (`permissionState`,
`hasStaffScope`, `hasCategoryScope`) và `isStaff` bị bỏ: không còn chỗ nào trong `src` dùng.

### 3. Một lượt hỏi quyền mỗi lần đăng nhập

`login` và `loginWithGoogle` hỏi `isPrivileged` một lần, truyền kết quả vào `openSession` (tham số
`privileged`), thay vì `openSession` tự hỏi lại.

### 4. `actorOf` dùng chung

`actorOf(request)` ở `src/common/auth/actor.ts`; năm bản chép trong `auth.plugin.ts` và các file route bị bỏ.

### Dữ liệu

| Bảng                 | Thay đổi                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `sessions`           | thêm index `(expires_at)` và partial `(revoked_at) WHERE revoked_at IS NOT NULL`            |
| `disposable_domains` | bỏ `disposable_domains_active_idx` — trùng khoá chính `domain`, lượt tra đã dùng khoá chính |

Migration `tune_hot_path_indexes`, không mất dữ liệu, không SQL viết tay ngoài index partial (khai trong
schema). `refresh_token_hash` vốn đổi ở mỗi lần làm mới nên lượt ghi đó đã cập nhật index; thêm `expires_at`
chỉ thêm một index, không làm mất HOT update.

## Risks / Trade-offs

- [SQL tay lệch khi đổi tên cột] → Hợp đồng repository đỏ ở phía Postgres; `pnpm test:db` bắt.
- [Hai index mới trên `sessions` tốn ghi ở mỗi lần làm mới] → Một index thêm trên một lượt ghi vốn đã cập
  nhật hai index; đổi lại việc dọn hằng đêm không quét cả bảng.

## Migration Plan

Áp `tune_hot_path_indexes` (tạo index trên bảng đang chạy, không khoá lâu với kích thước hiện tại); triển khai
code. Lùi: revert code, index thừa vô hại.

## Open Questions

_(không có)_
