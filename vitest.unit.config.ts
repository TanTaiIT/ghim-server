import { defineConfig } from 'vitest/config';

import base from './vitest.config.js';

/*
 * Test thuần, chạy được trên máy không có Postgres hay kho ảnh (`pnpm test:unit`). Bỏ `globalSetup` và
 * `setupFiles` của cấu hình chính: hai file đó áp migration và mở kết nối DB trước MỌI file, kể cả file
 * không chạm DB. `pnpm test` vẫn chạy cả các file này cùng phần còn lại.
 *
 * Quy ước để vào đây: calc thuần đặt tên `*.calc.test.ts`; test thuần khác thì thêm tên vào danh sách.
 */
const PURE_TESTS = [
  'tests/build-regions.test.ts',
  'tests/config-keys.test.ts',
  'tests/env.test.ts',
  'tests/health.service.test.ts',
  'tests/lookup-code.test.ts',
  'tests/mailer.test.ts',
  'tests/money.test.ts',
  'tests/outbox-retry.test.ts',
  'tests/pagination.test.ts',
  'tests/runtime-config.test.ts',
  'tests/secrets.test.ts',
  'tests/trust-proxy.test.ts',
];

export default defineConfig({
  test: {
    ...base.test,
    include: ['tests/**/*.calc.test.ts', ...PURE_TESTS],
    globalSetup: [],
    setupFiles: [],
  },
});
