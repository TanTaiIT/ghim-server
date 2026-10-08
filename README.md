# calendar-ghim

Backend cho **Ghim — sàn rao vặt**, bản làm lại trên Fastify 5 + Prisma 7 + PostgreSQL 18, cùng
công nghệ với dự án `../booking`.

- Luật nghiệp vụ: `../../Vue/docs/new-source/THIET-KE-HE-THONG.md` (bản thiết kế duy nhất).
- Luật code, cấu trúc thư mục, kế hoạch module: [`CLAUDE.md`](CLAUDE.md).

Hiện trạng: **mới có bộ khung** — hạ tầng HTTP, lỗi, response, Swagger, health check, test và CI.
Chưa có bảng nào trong DB; module đầu tiên là `identity` (đợt 1).

## Cần có

- Node.js 24 (`.nvmrc`) và pnpm 12 (`corepack enable`)
- Docker, để chạy Postgres cho dev và cho test DB

## Chạy lần đầu

```bash
pnpm install
cp .env.development.example .env.development
pnpm db:up          # Postgres dev ở cổng 5435
pnpm dev            # http://localhost:3100
```

- `GET /health` — tiến trình còn sống không (không chạm DB)
- `GET /health/ready` — nối được DB chưa (503 nếu chưa)
- `GET /docs` — Swagger, sinh từ chính schema Zod (tắt ở production)

## Lệnh

| Lệnh                                  | Làm gì                                                      |
| ------------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                            | Chạy dev, tự nạp lại khi sửa code                           |
| `pnpm run check`                      | typecheck + lint + test (không cần DB)                      |
| `pnpm db:test:up` → `pnpm test:db`    | Test trên Postgres thật (container riêng, cổng 5436, tmpfs) |
| `pnpm run build` → `pnpm start:local` | Build rồi chạy bản build với env dev                        |
| `pnpm db:migrate`                     | Tạo và áp migration trên DB dev                             |
| `pnpm db:drift`                       | Kiểm migration đã áp có khớp `schema.prisma` không          |
| `pnpm db:studio`                      | Mở Prisma Studio                                            |

Production chỉ chạy `pnpm db:deploy` (hoặc `pnpm db:deploy:prod` từ máy có `.env.production`) rồi
`pnpm start`. Image Docker: `Dockerfile` (nhiều tầng, chạy bằng user `node`, cổng 3100).
