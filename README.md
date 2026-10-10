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
4. `pnpm run check`, `pnpm test:db`, `pnpm run build` xanh → `/opsx:archive` gộp spec vào
   `openspec/specs/`.

Cần CLI `openspec` trên PATH, cùng phiên bản trong `package.json`:
`npm i -g @fission-ai/openspec@1.14.1`.

Hiện trạng: hạ tầng (HTTP, lỗi, response, Swagger, health, việc nền pg-boss, gửi thư, outbox) và
module **`identity`** (đợt 1): đăng ký + xác nhận email, đăng nhập / phiên / refresh, Google, hai lớp
TOTP cho master và staff, hồ sơ, đổi email, quên / đổi mật khẩu, khoá / mở khoá / xoá tài khoản, dấu
thiết bị + mã tra cứu, xác minh giấy tờ, danh sách email dùng một lần. 9 bảng trong DB.

## Cần có

- Node.js 24 (`.nvmrc`) và pnpm 12 (`corepack enable`)
- Docker, để chạy Postgres cho dev và cho test DB

## Chạy lần đầu

```bash
pnpm install
pnpm exec prisma generate   # Prisma 7 không tự sinh client khi install; thiếu bước này `pnpm dev` chết ở import `@prisma/client`
cp .env.development.example .env.development   # đã có sẵn khoá dev cho identity, SMTP trỏ Mailpit
pnpm db:up          # Postgres dev ở cổng 5435
pnpm mail:up        # Mailpit: SMTP 1025, hộp thư http://localhost:8025 — mã xác nhận chỉ xem được ở đây
pnpm db:migrate     # áp migration lên DB dev
pnpm dev            # http://localhost:3100 — lần đầu nạp ~96k miền email dùng một lần (vài giây)
```

- `GET /health` — tiến trình còn sống không (không chạm DB)
- `GET /health/ready` — nối được DB chưa (503 nếu chưa)
- `GET /docs` — Swagger, sinh từ chính schema Zod (tắt ở production); mọi route nghiệp vụ dưới `/api/v1`
- Biến môi trường của `identity` (`JWT_SECRET`, `IDENTITY_HASH_KEY`, `SECRETS_ENCRYPTION_KEY`, `SMTP_URL`,
  `MAIL_FROM`, `GOOGLE_CLIENT_IDS`, `DISPOSABLE_DOMAINS_URL`): ý nghĩa và ràng buộc ở `src/config/env.ts`

## Lệnh

| Lệnh                                  | Làm gì                                                      |
| ------------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                            | Chạy dev, tự nạp lại khi sửa code                           |
| `pnpm run check`                      | typecheck + lint + test (không cần DB)                      |
| `pnpm db:test:up` → `pnpm test:db`    | Test trên Postgres thật (container riêng, cổng 5436, tmpfs) |
| `pnpm mail:up`                        | Mailpit cho thư ở dev (SMTP 1025, hộp thư 8025)             |
| `pnpm run build` → `pnpm start:local` | Build rồi chạy bản build với env dev                        |
| `pnpm db:migrate`                     | Tạo và áp migration trên DB dev                             |
| `pnpm db:drift`                       | Kiểm migration đã áp có khớp `schema.prisma` không          |
| `pnpm db:studio`                      | Mở Prisma Studio                                            |

Production chỉ chạy `pnpm db:deploy` (hoặc `pnpm db:deploy:prod` từ máy có `.env.production`) rồi
`pnpm start`. Image Docker: `Dockerfile` (nhiều tầng, chạy bằng user `node`, cổng 3100).
