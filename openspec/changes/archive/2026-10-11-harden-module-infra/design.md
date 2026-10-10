# Design

## Context

Ba module đầu đã chạy, test xanh, archive xong. Rà soát ngày 10/10/2026 xếp bốn việc hạ tầng phải làm trước
khi thêm module mới (mục 6–9 của rà soát); bốn lỗi hành vi đã sửa trong các change trước, lỗi làm mới phiên
nằm ở `fix-session-refresh-race`. Change này không đổi hành vi nào người dùng thấy.

## Goals / Non-Goals

**Goals**: sự kiện hỏng không chặn sự kiện mới; chạy nhiều tiến trình không phát trùng; bản giả và DB trả lời
giống nhau cho mọi ràng buộc mà service dựa vào; không file service nào quá 500 dòng; thêm một module là thêm
một dòng vào danh sách.

**Non-Goals**: đổi hợp đồng bên nghe outbox; đổi API; gộp truy vấn xác thực; phân trang con trỏ (proposal).

## Decisions

### 1. Outbox: giờ hẹn thử lại và khoá có hạn giữ

```
outbox_events  + next_attempt_at timestamptz NOT NULL DEFAULT now()
               + locked_until    timestamptz NULL
               index thay thế: (next_attempt_at) WHERE published_at IS NULL
```

Một lượt của bộ phát nhận lô trong một câu lệnh:

```sql
UPDATE outbox_events SET locked_until = now() + interval '60 seconds'
 WHERE id IN (
   SELECT id FROM outbox_events
    WHERE published_at IS NULL AND next_attempt_at <= now()
      AND (locked_until IS NULL OR locked_until < now())
    ORDER BY next_attempt_at, created_at
    LIMIT 100
    FOR UPDATE SKIP LOCKED)
RETURNING id, type, payload, attempts
```

`SKIP LOCKED` cho hai tiến trình lấy hai lô rời nhau; `locked_until` là hạn giữ: tiến trình chết giữa lượt thì
60 giây sau lô được nhận lại (bên nghe vốn phải idempotent). Phát xong: `published_at = now(), locked_until =
null`. Bên nghe ném: `attempts + 1`, `last_error`, `locked_until = null`, `next_attempt_at = now() + min(10 giây
× 2^(attempts), 1 giờ)` — sự kiện hỏng lùi dần ra sau, sự kiện mới vẫn đi. Chạm 10 lần thử thì `logger.error`
một lần mỗi lượt cho sự kiện đó (người trực thấy cái nào kẹt). Không có trần bỏ sự kiện: luật "không bao giờ
bỏ sự kiện" giữ nguyên.

Thứ tự: sự kiện cùng loại không còn đảm bảo phát theo thứ tự tạo khi một cái đang lùi. Bên nghe hiện có
(`identity.account.locked` → treo quyền) không phụ thuộc thứ tự; hợp đồng bên nghe ghi thêm "không dựa vào thứ
tự giữa các sự kiện".

Con số 60 giây, 10 giây, 1 giờ, 10 lần là hằng số hạ tầng trong `dispatcher.ts`, không phải con số vận hành
của TK 28.

_Thay thế đã cân nhắc:_ trần số lần thử rồi chuyển sang bảng "chết" — trái luật không bỏ sự kiện và cần thêm
một luồng vận hành; khoá advisory toàn bảng — chỉ một tiến trình phát, nghẽn khi tải tăng.

### 2. Bản giả ném lỗi của Prisma, và có test hợp đồng

`FakeUniqueViolation` (lớp tự chế, `code = 'P2002'`) đổi thành hàm `uniqueViolation(target)` tạo
`new Prisma.PrismaClientKnownRequestError(…, { code: 'P2002', clientVersion: 'fake', meta: { target } })` —
`errorHandler` nhận ra như lỗi thật, test HTTP trên bản giả trả cùng 409 như production.

Test hợp đồng: file phẳng `tests/<module>-repository.contract.ts` xuất một hàm
`describe<Module>RepositoryContract(make)` nhận cách dựng repository; gọi từ một file `*.test.ts` (bản giả) và
một file `*.db.test.ts` (Postgres). Mỗi hợp đồng chỉ chứa ca **tuần tự** mà cả hai bản phải trả giống nhau:
unique (email tài khoản, tên danh mục), khoá lạc quan (nháp mẫu, phiên bản con số), tiêu mã một lần, phiên
bản cài đặt kế tiếp. Ca đồng thời thật vẫn chỉ ở test DB, vì bản giả chạy tuần tự.

### 3. Tách service của `identity`

```
identity.service.ts          createIdentityService(deps): ghép ba phần, giữ nguyên interface IdentityService
identity.auth.service.ts     đăng ký, xác nhận email, gửi lại mã, đăng nhập, làm mới, đăng xuất, quên / đặt lại
                             mật khẩu, Google
identity.account.service.ts  hồ sơ, đổi email, đổi mật khẩu, phiên của tôi, hai lớp, xoá tài khoản, nộp giấy tờ
identity.ops.service.ts      khoá / mở khoá, đánh dấu thiết bị, duyệt giấy tờ, miền dùng một lần, tạo master,
                             đặt lại hai lớp, accountState
identity.shared.ts           phần dùng chung: phát và so mã, mở phiên, claimEmail, isPrivileged, lỗi dựng sẵn
```

Mỗi phần là factory nhận cùng `deps` cộng phần dùng chung đã dựng; không phần nào gọi phần khác ngoài
`identity.shared.ts`. Mục tiêu dưới 500 dòng mỗi file. Không test nào phải sửa: đó là phép thử của việc tách.

### 4. Định nghĩa module và danh sách module

```ts
// src/common/module/app-module.ts
interface AppModule {
  name: string;
  routes: FastifyPluginAsyncZod; // đăng ký dưới /api/v1
  listeners?: (dispatcher: OutboxDispatcher) => void;
  jobs?: (jobs: Jobs) => Promise<void>;
  startup?: () => Promise<Record<string, unknown> | null>; // kết quả để log; null = không làm gì
}
```

Mỗi module có `<module>.module.ts` xuất `create<Module>Module(deps, peers)`: dựng repository (nếu không được
truyền), service, và trả `{ module, service }`. `buildApp` dựng theo thứ tự phụ thuộc cố định —
`identity` → `category` → `platform` (platform cần cửa đọc của cả hai) — rồi đăng ký `routes` của từng module,
decorate `app.modules` (bản đồ tên → service, thay cho `app.identity` / `app.platform` / `app.category`).
`server.ts` gọi `listeners` vào bộ phát, rồi `startup` theo đúng thứ tự danh sách, log kết quả khác `null`.

`AppDeps` tách đôi: hạ tầng dùng chung (`jobs`, `mailer`, `googleVerifier`, `clock`, `config`,
`privilegeSource`) và `repositories: Partial<{ identity; platform; category }>`. `buildTestApp` điền bản giả
vào `repositories`. Thêm module mới = một file `.module.ts`, một dòng trong danh sách, một khoá trong
`repositories`.

_Thay thế đã cân nhắc:_ container DI (awilix…) — thêm package và phép màu cho ba module; tự động dò thư mục
`modules/` — thứ tự phụ thuộc thành ngầm định.

### Dữ liệu

| Bảng            | Thay đổi                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------- |
| `outbox_events` | thêm `next_attempt_at` (NOT NULL, mặc định `now()`), `locked_until` (NULL); đổi partial index |

Migration `outbox_retry_lease`: thêm cột có mặc định (dòng cũ nhận `now()`, phát ngay lượt đầu), không mất dữ
liệu, không SQL viết tay ngoài index partial (khai trong schema).

## Risks / Trade-offs

- [Sự kiện hỏng lùi tới 1 giờ giữa hai lần thử] → Đúng ý đồ: lỗi lâu thì người trực xem `last_error`; sửa
  xong, đặt `next_attempt_at = now()` bằng tay là phát ngay (ghi trong CLAUDE.md luật 12).
- [Tách `identity` là refactor lớn] → Không đổi interface, không sửa test; diff chỉ là di chuyển code.
- [`app.modules` thay ba decorate] → Test và `server.ts` đổi theo trong cùng change; không có code ngoài repo
  dùng các decorate này.

## Migration Plan

1. Migration `outbox_retry_lease` (thêm cột, đổi index) — áp được trên DB đang chạy, không khoá bảng lâu.
2. Triển khai code mới; sự kiện cũ chưa phát có `next_attempt_at = now()` nên được phát ngay.
3. Lùi: revert code; hai cột thừa vô hại, xoá bằng migration sau nếu cần.

## Open Questions

_(không có)_
