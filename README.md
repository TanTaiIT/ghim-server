# calendar-ghim

Backend cho **Ghim — sàn rao vặt**, bản làm lại trên Fastify 5 + Prisma 7 + PostgreSQL 18, cùng
công nghệ với dự án `../booking`.

- Bản thiết kế cho người đọc: [`docs/THIET-KE-HE-THONG.md`](docs/THIET-KE-HE-THONG.md) (+ `.pdf`).
- Luật để code, theo đợt: `openspec/changes/` · đã làm xong: `openspec/specs/` — `pnpm run spec:list`
  để xem, `openspec view` để xem bảng tổng.
- Luật code, cấu trúc thư mục, kế hoạch module: [`CLAUDE.md`](CLAUDE.md).

## Làm một tính năng mới (OpenSpec)

Trong Claude Code, mở thư mục này làm workspace rồi:

1. `/opsx:explore` — bàn khi chưa rõ nên làm gì (không sửa file nào).
2. `/opsx:propose <mô tả>` — tạo `openspec/changes/<tên>/` gồm proposal, specs, design, tasks. Đọc và
   duyệt trước khi code.
3. `/opsx:apply` — làm theo tasks, đánh dấu từng việc xong.
4. `pnpm run check`, `pnpm run build` xanh → `/opsx:archive` gộp spec vào
   `openspec/specs/`.

Cần CLI `openspec` trên PATH, cùng phiên bản trong `package.json`:
`npm i -g @fission-ai/openspec@1.14.1`.

Hiện trạng (đợt 1, một phần đợt 2): hạ tầng (HTTP, lỗi, response, Swagger, health, việc nền pg-boss, gửi thư, outbox, realtime
socket.io ở `/realtime`) và các module:

- **`identity`**: đăng ký + xác nhận email, đăng nhập / phiên / refresh, Google, hai lớp TOTP cho master và staff,
  hồ sơ, đổi email, quên / đổi mật khẩu, khoá / mở khoá / xoá tài khoản, dấu thiết bị + mã tra cứu, xác minh giấy
  tờ, danh sách email dùng một lần.
- **`platform`**: master, quyền staff theo danh mục, bảng con số có phiên bản, nhật ký bàn vận hành.
- **`category`**: danh mục, mẫu thông tin có phiên bản, trần giá, khu vực.
- **`group`**: nhóm bốn chế độ, vòng đời (giao chủ, thiếu chủ, khoá, đóng), vào nhóm (tham gia, đơn, lời mời, mã,
  danh sách lớp), đơn vị con, vai, huy hiệu, thông báo của nhóm.
- **`notification`**: hộp thư, bật tắt từng nhóm thông báo, tắt tiếng từng nhóm, gộp chuyện lặp lại, đẩy realtime
  — hướng dẫn cho app ở [`docs/realtime.md`](docs/realtime.md). Push lên điện thoại chưa làm.
- **`media`** (đợt 2): kho ảnh chuẩn S3 (R2 ở production, RustFS khi dev / test), app tải thẳng bằng quyền tải
  một lần, nhãn "chưa xác nhận", dọn ảnh 6 giờ và đối chiếu hằng tháng; ảnh đại diện (ảnh trong kho hay ảnh Google)
  — hướng dẫn cho app ở [`docs/media.md`](docs/media.md).
- **`listing`** (đợt 2): nháp, gửi, vòng đời tám trạng thái, sửa (qua máy lại hay áp ngay), ngày hiển thị và gia
  hạn, tạm ẩn theo tài khoản / nhóm / danh mục, hai mức hiển thị, ai thấy tin, bảng tin / tìm kiếm / hồ sơ phân trang
  con trỏ, huy hiệu nhóm, chuyển tin đã rời nhóm lên sàn chung, thông báo N31–N35, N37. Mức tin cậy và máy duyệt
  còn là bản tạm (`DEV_TRUST_TIER`, `DEV_MACHINE_REVIEW` ở dev) tới `add-trust-tiers`, `add-screening`.

## Cần có

- Node.js 24 (`.nvmrc`) và pnpm 12 (`corepack enable`)
- Docker, để chạy Postgres, Mailpit và kho ảnh (RustFS) cho dev và cho test

## Chạy lần đầu

```bash
pnpm install
pnpm exec prisma generate   # Prisma 7 không tự sinh client khi install; thiếu bước này `pnpm dev` chết ở import `@prisma/client`
cp .env.development.example .env.development   # đã có sẵn khoá dev cho identity, SMTP trỏ Mailpit, kho trỏ RustFS
pnpm db:up          # Postgres dev ở cổng 5435
pnpm mail:up        # Mailpit: SMTP 1025, hộp thư http://localhost:8025 — mã xác nhận chỉ xem được ở đây
pnpm storage:up     # kho ảnh RustFS ở cổng 9100; bucket tự tạo lúc server khởi động; xem ảnh ở http://localhost:9101/rustfs/console/
pnpm db:migrate     # áp migration lên DB dev
pnpm dev            # http://localhost:3100 — lần đầu nạp ~96k miền email dùng một lần, bảng con số
                    # phiên bản 1 và 34 tỉnh / 3.321 phường (vài giây)
MASTER_PASSWORD='<mật khẩu>' pnpm cli:create-master --email <email> --name "Quản trị Ghim"
```

Master chỉ tạo được bằng lệnh trên (không có route HTTP nào), và hệ thống có đúng một master. Đăng nhập
bằng email / mật khẩu đó, rồi thiết lập lớp thứ hai (`POST /api/v1/me/two-factor/setup` → `/confirm`)
trước khi bàn vận hành mở. Master mất ứng dụng tạo mã: `pnpm cli:reset-2fa --email <email>` gỡ lớp
thứ hai và thu hồi mọi phiên. Quên mật khẩu thì đi "quên mật khẩu" như mọi người (ở dev, mã nằm trong
Mailpit).

- `GET /health` — tiến trình còn sống không (không chạm DB)
- `GET /health/ready` — nối được DB chưa (503 nếu chưa)
- `GET /docs` — Swagger, sinh từ chính schema Zod (tắt ở production); mọi route nghiệp vụ dưới `/api/v1`
- Biến môi trường của `identity` (`JWT_SECRET`, `IDENTITY_HASH_KEY`, `SECRETS_ENCRYPTION_KEY`, `SMTP_URL`,
  `MAIL_FROM`, `GOOGLE_CLIENT_IDS`, `DISPOSABLE_DOMAINS_URL`): ý nghĩa và ràng buộc ở `src/config/env.ts`
- Thử trọn vòng tin đăng ở dev: `DEV_MACHINE_REVIEW=pass_full` để máy tạm cho qua mọi lượt gửi (mặc định `off` —
  tin đứng ở "đang kiểm"); `DEV_TRUST_TIER` (mặc định `T1`) đặt mức tin cậy mọi tài khoản mang. App gửi
  `x-device-id` ở mọi lượt gửi tin.

## Lệnh

| Lệnh                                                          | Làm gì                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                                    | Chạy dev, tự nạp lại khi sửa code                                                                                  |
| `pnpm db:test:up` → `pnpm storage:test:up` → `pnpm run check` | typecheck + lint + test trên Postgres (5436) và kho ảnh (9110) thật, tmpfs                                         |
| `pnpm mail:up`                                                | Mailpit cho thư ở dev (SMTP 1025, hộp thư 8025)                                                                    |
| `pnpm storage:up`                                             | Kho ảnh dev (RustFS, cổng 9100); xem ảnh ở http://localhost:9101/rustfs/console/ (khoá `ghim` / `ghim-dev-secret`) |
| `pnpm run build` → `pnpm start:local`                         | Build rồi chạy bản build với env dev                                                                               |
| `pnpm db:migrate`                                             | Tạo và áp migration trên DB dev                                                                                    |
| `pnpm db:drift`                                               | Kiểm migration đã áp có khớp `schema.prisma` không                                                                 |
| `pnpm db:studio`                                              | Mở Prisma Studio                                                                                                   |
| `pnpm cli:create-master`                                      | Tạo master (một lần, chỉ khi chưa có)                                                                              |
| `pnpm cli:reset-2fa`                                          | Gỡ lớp thứ hai + thu hồi phiên của một tài khoản                                                                   |
| `pnpm cli:build-regions`                                      | Sinh lại `category/data/regions.json` từ provinces.open-api.vn                                                     |

**Cập nhật địa giới hành chính**: `pnpm cli:build-regions` tải API, trộn tên cũ cấp tỉnh từ
`src/modules/category/data/province-former-names.json` (biên soạn tay) và dừng nếu dữ liệu lệch kỳ vọng.
Đọc diff của `regions.json` rồi commit. DB đã có khu vực thì không tự nạp lại — cập nhật DB đang chạy là
một migration dữ liệu riêng. Tên cũ cấp phường chưa có nguồn: cột có sẵn, file đang để trống.

**Mạng ở production**: `CORS_ORIGIN` phải là danh sách origin cụ thể và `TRUST_PROXY` phải khai dải địa chỉ
của proxy đứng trước app (vd `uniquelocal`), hoặc `false` khi app nhận thẳng từ Internet — thiếu hay sai là app không
khởi động. Rate limit và IP lưu trong phiên đăng nhập dựa vào đó.

**Kết nối DB**: mỗi tiến trình mở tối đa `DATABASE_POOL_MAX` (mặc định 10) kết nối cho request và
`JOBS_POOL_MAX` (mặc định 5) cho việc nền. Tổng nhân số tiến trình phải dưới `max_connections` của Postgres
(mặc định 100), chừa chỗ cho migration và người vận hành. Trần thời gian cố định trong code: mỗi câu SQL 15
giây, chờ lấy kết nối 5 giây, nhận request 30 giây.

Production chỉ chạy `pnpm db:deploy` (hoặc `pnpm db:deploy:prod` từ máy có `.env.production`) rồi
`pnpm start`. Image Docker: `Dockerfile` (nhiều tầng, chạy bằng user `node`, cổng 3100).

## Trước khi chạy thật

- **Kho ảnh R2**: bucket riêng cho production; khoá API chỉ có quyền đọc / ghi tệp của đúng bucket đó (server không
  tạo bucket ở production). Test cổng của kho (`tests/storage.test.ts`) mới chạy trên RustFS — chạy lại một lần trên
  R2 staging, bằng khoá có quyền tạo bucket:
  `TEST_STORAGE_URL='https://<key>:<secret>@<account>.r2.cloudflarestorage.com/ghim-staging-test?region=auto' pnpm exec vitest run tests/storage.test.ts`
  — đặc biệt ca tải lần hai cùng URL phải ra 412 (design `add-media` mục 1).
