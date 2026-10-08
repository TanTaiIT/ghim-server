import { execFileSync } from 'node:child_process';

import { databaseEnvironmentIssue } from '../src/config/database-guard.js';

/**
 * Áp migration lên DB test bằng CHÍNH các file migration — không `db push`: thứ cần kiểm là
 * migration SQL viết tay (exclusion constraint, CHECK, partial index) có thật sự nằm trong DB.
 *
 * `migrate deploy` chứ không `migrate reset`: container `postgres-test` chạy trên tmpfs nên đã
 * trống mỗi lần khởi động, và các ca test tự xoá bảng (`truncateAll`). DB test lệch khỏi migration
 * (vd vừa đổi nhánh) thì dựng lại container: `docker compose rm -sf postgres-test && pnpm db:test:up`.
 *
 * Gọi thẳng `node …/prisma/build/index.js` thay vì `pnpm exec prisma`: chạy được như nhau trên
 * Windows và Linux mà không cần shell.
 */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  const issue = databaseEnvironmentIssue('test', url);
  if (!url || issue) {
    throw new Error(issue ?? 'Thiếu TEST_DATABASE_URL');
  }

  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url },
    stdio: 'inherit',
  });
}
