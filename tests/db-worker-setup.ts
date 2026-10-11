import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll } from 'vitest';

import { workerDatabaseUrl } from './db-names.js';

/*
 * Chạy trước mỗi file test, trước khi file đó nạp `src/`: trỏ `DATABASE_URL` vào DB của worker này
 * (`db-global-setup.ts` đã nhân bản), xoá sạch dữ liệu file trước để lại, và đóng pool khi file xong —
 * mỗi file nạp lại module nên có client Prisma riêng, không đóng thì kết nối dồn tới trần của Postgres.
 */
process.env.DATABASE_URL = workerDatabaseUrl(
  process.env.TEST_DATABASE_URL ?? '',
  process.env.TEST_RUN_ID ?? '',
  Number(process.env.VITEST_POOL_ID ?? 1),
);

// Giữ đúng client file đã dùng: file gọi `vi.resetModules()` thì lượt nạp lại ở `afterAll` ra client khác.
let client: PrismaClient | undefined;

beforeAll(async () => {
  const { prisma, truncateAll } = await import('./db-helpers.js');
  client = prisma;
  await truncateAll();
});

afterAll(async () => {
  await client?.$disconnect();
});
