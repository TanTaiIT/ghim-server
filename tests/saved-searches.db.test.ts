import { beforeEach, describe, expect, it } from 'vitest';

import { prisma, prismaErrorCode, sqlStateOf, truncateAll } from './db-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { TEST_NOW } from './test-app.js';

/*
 * Ràng buộc DB của `saved_searches` (add-saved-searches): một dòng mỗi (người, khoá lượt tìm); CHECK từ khoá không rỗng
 * và khoảng giá không ngược — ba điều chỉ DB trả lời được.
 */
const UNIQUE = 'P2002';
const CHECK = '23514';

beforeEach(truncateAll);

const row = (accountId: string, fields: object = {}) => ({
  accountId,
  key: '["SAMSUNG",null,null,null,null,null]',
  q: 'Samsung',
  qFolded: 'SAMSUNG',
  createdAt: TEST_NOW,
  ...fields,
});

describe('saved_searches', () => {
  it('cùng người, cùng khoá lần thứ hai → P2002; người khác cùng khoá thì được', async () => {
    const [a, b] = [await seedAccount(), await seedAccount()];
    await prisma.savedSearch.create({ data: row(a.id) });
    expect(await prismaErrorCode(prisma.savedSearch.create({ data: row(a.id) }))).toBe(UNIQUE);
    await prisma.savedSearch.create({ data: row(b.id) });
  });

  it('CHECK: từ khoá đã bỏ dấu không rỗng; giá từ không lớn hơn giá đến, thiếu một đầu thì không kiểm', async () => {
    const { id } = await seedAccount();
    expect(
      await sqlStateOf(prisma.savedSearch.create({ data: row(id, { key: 'a', qFolded: '' }) })),
    ).toBe(CHECK);
    expect(
      await sqlStateOf(
        prisma.savedSearch.create({ data: row(id, { key: 'b', priceMin: 9n, priceMax: 1n }) }),
      ),
    ).toBe(CHECK);
    await prisma.savedSearch.create({ data: row(id, { key: 'c', priceMin: 9n }) });
    await prisma.savedSearch.create({ data: row(id, { key: 'd', priceMin: 1n, priceMax: 9n }) });
  });
});
