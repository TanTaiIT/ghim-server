import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

import { databaseEnvironmentIssue } from './src/config/database-guard.js';

/*
 * Nạp `.env.<NODE_ENV>` (bỏ trống = development). Biến đã có sẵn trong tiến trình — CI, container
 * production, hoặc `node --env-file=.env.production` — luôn THẮNG file, vì dotenv không ghi đè.
 * `NODE_ENV=test` không có file nào: DB test do `vitest.db.config.ts` / CI truyền vào.
 */
const nodeEnv = process.env.NODE_ENV ?? 'development';
config({ path: `.env.${nodeEnv}`, quiet: true });

// Chặn TRƯỚC khi CLI kịp chạm DB: `migrate reset` trên nhầm DB là mất dữ liệu thật.
const databaseIssue = databaseEnvironmentIssue(nodeEnv, process.env.DATABASE_URL);
if (databaseIssue) throw new Error(databaseIssue);

/*
 * Production chỉ được `migrate deploy`. Các lệnh dưới xoá dữ liệu, sinh migration từ độ lệch, hoặc
 * ghi dữ liệu mồi có mật khẩu ai cũng biết — tên DB đúng cũng không cứu được khi chạy nhầm lệnh.
 */
const DEV_ONLY_COMMANDS = [
  ['migrate', 'reset'],
  ['migrate', 'dev'],
  ['db', 'push'],
  ['db', 'seed'],
] as const;
const [command, subcommand] = process.argv.slice(2);
if (
  nodeEnv === 'production' &&
  DEV_ONLY_COMMANDS.some(([c, s]) => c === command && s === subcommand)
) {
  throw new Error(`Không chạy "prisma ${command} ${subcommand}" khi NODE_ENV=production.`);
}

/**
 * Cấu hình cho Prisma CLI (migrate, studio) — TÁCH khỏi `schema.prisma` từ Prisma 7.
 *
 * Vì sao chuỗi kết nối không còn nằm trong schema: schema là thứ được commit và chia sẻ, còn
 * chuỗi kết nối là bí mật theo từng môi trường. Tách ra thì file schema không còn lý do nào để
 * đọc `process.env`.
 *
 * Đọc thẳng `process.env` chứ không qua `src/config/env.ts`: file này chạy trong tiến trình
 * CLI, nơi các biến của app chưa chắc có mặt — nạp schema env đầy đủ ở đây sẽ làm
 * `prisma migrate` chết vì thiếu một biến chẳng liên quan gì tới DB.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
