import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Test chạm DB chạy riêng bằng `pnpm test:db` (vitest.db.config.ts) — bộ này không đòi Postgres.
    exclude: [...configDefaults.exclude, '**/*.db.test.ts'],
    /*
     * Env cho test — giá trị giả, KHÔNG trỏ vào DB thật.
     *
     * Phải khai đủ vì `src/config/env.ts` fail fast: thiếu một biến là mọi file test import
     * gián tiếp tới nó đều đỏ, với câu lỗi chẳng liên quan gì tới thứ đang test. `DATABASE_URL`
     * có mặt để `PrismaClient` dựng được — bộ test này KHÔNG chạm DB, xem `tests/README.md`.
     */
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://ghim:ghim@localhost:5432/ghim_test',
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
