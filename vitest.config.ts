import { availableParallelism } from 'node:os';

import { defineConfig } from 'vitest/config';

/*
 * Mọi test chạy trên Postgres thật (`pnpm db:test:up`; CI truyền `TEST_DATABASE_URL`). Tên DB phải
 * kết thúc bằng `_test`. `tests/db-global-setup.ts` áp migration lên DB này rồi nhân bản một DB cho
 * mỗi worker, nên các file vẫn chạy song song mà không giẫm dữ liệu nhau.
 *
 * Ghi vào `process.env` để `globalSetup` (chạy ở tiến trình chính, không nhận `test.env`) đọc đúng
 * các giá trị mà worker dùng.
 */
process.env.TEST_DATABASE_URL ??= 'postgresql://ghim:ghim@localhost:5436/ghim_test';
process.env.TEST_RUN_ID = String(process.pid);
// Mỗi worker giữ tới DATABASE_POOL_MAX kết nối: 8 × 5 còn xa trần 100 của Postgres.
const workers = Math.max(1, Math.min(8, availableParallelism() - 1));
process.env.TEST_WORKERS = String(workers);

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['tests/db-global-setup.ts'],
    setupFiles: ['tests/db-worker-setup.ts'],
    maxWorkers: workers,
    testTimeout: 20_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      // Ghi đè theo worker trong `db-worker-setup.ts`; giá trị này chỉ để env.ts qua được lúc nạp.
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      DATABASE_POOL_MAX: '5',
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
      TEST_RUN_ID: process.env.TEST_RUN_ID,
      JWT_SECRET: 'test-jwt-secret-du-ba-muoi-hai-ky-tu-0001',
      IDENTITY_HASH_KEY: 'test-identity-hash-key-du-ba-muoi-hai-ky-tu-01',
      SECRETS_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      MAIL_FROM: 'Ghim test <no-reply@ghim.test>',
      // SMTP_URL cố ý vắng: `tests/mailer.test.ts` chỉ gửi thật khi shell truyền biến này vào.
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/lib/prisma.ts'],
    },
  },
});
