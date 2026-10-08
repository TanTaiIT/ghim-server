import { defineConfig } from 'vitest/config';

/**
 * Bộ test CHẠM DB (`pnpm test:db`) — tách khỏi `pnpm test` để bộ nhanh không đòi Postgres.
 *
 * DB mặc định là container `postgres-test` trong `docker-compose.yml` (`pnpm db:test:up`). CI truyền
 * `TEST_DATABASE_URL` riêng. Tên DB phải kết thúc bằng `_test`: `tests/db-global-setup.ts` áp
 * migration lên nó, và mỗi ca xoá sạch bảng.
 *
 * Ghi lại vào `process.env` để `globalSetup` (chạy ở tiến trình chính, không nhận `test.env`) đọc
 * đúng chuỗi mà các file test dùng.
 */
process.env.TEST_DATABASE_URL ??= 'postgresql://ghim:ghim@localhost:5436/ghim_test';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.db.test.ts'],
    globalSetup: ['tests/db-global-setup.ts'],
    // Các file dùng chung MỘT DB và xoá bảng trước mỗi ca — chạy song song là giẫm dữ liệu nhau.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      LOG_LEVEL: 'warn',
    },
  },
});
