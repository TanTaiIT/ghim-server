import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { getReadiness } from '../src/modules/health/health.service.js';
import { prisma, truncateAll } from './db-helpers.js';

/*
 * Ca DB đầu tiên, có mặt từ lúc chưa có bảng nào: chứng minh đường ống `pnpm test:db` thông —
 * container lên, `migrate deploy` chạy, app nối được bằng driver adapter. Module đầu tiên thêm
 * ràng buộc DB thì thêm file `<module>.db.test.ts` bên cạnh, không nhét vào đây.
 */
beforeEach(truncateAll);

afterAll(() => prisma.$disconnect());

describe('Readiness trên Postgres thật', () => {
  it('nối được DB thì báo up', async () => {
    await expect(getReadiness()).resolves.toEqual({ database: 'up' });
  });

  it('đang ở đúng DB `_test`, không phải dev hay production', async () => {
    const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    expect(row?.name).toMatch(/_test$/);
  });
});
