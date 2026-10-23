import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createIdentityRepository } from '../src/modules/identity/identity.repository.js';
import { createPlatformRepository } from '../src/modules/platform/platform.repository.js';
import { truncateAll } from './db-helpers.js';

/*
 * Hai lượt đọc chạy ở mọi request có đăng nhập / mọi request bàn vận hành phải là MỘT câu SQL mỗi
 * lượt. Prisma 7 chạy `include` thành hai câu riêng (đo 11/10/2026), nên quay về `include` là âm
 * thầm nhân đôi tải DB của toàn app — test này đếm câu SQL thật để chặn chuyện đó.
 */
const NOW = new Date('2026-10-10T04:00:00.000Z');
const LATER = new Date('2026-11-10T04:00:00.000Z');

const statements: string[] = [];
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
  log: [{ emit: 'event', level: 'query' }],
});
client.$on('query', (event) => statements.push(event.query));

const identity = createIdentityRepository(client);
const platform = createPlatformRepository(client);

beforeEach(truncateAll);

afterAll(() => client.$disconnect());

async function staffWithCategories() {
  const account = await client.account.create({
    data: {
      email: 'hot@ghim.test',
      emailNormalized: 'hot@ghim.test',
      emailHash: 'h',
      passwordHash: 'x',
      displayName: 'Hot',
      status: 'active',
    },
  });
  const [phone, laptop] = await Promise.all(
    ['Điện thoại', 'Máy tính'].map((name) =>
      client.category.create({ data: { name, createdBy: account.id } }),
    ),
  );
  await client.staffPermission.create({
    data: { accountId: account.id, scopes: ['support'], grantedBy: account.id, grantedAt: NOW },
  });
  await client.staffCategoryGrant.createMany({
    data: [phone, laptop].map((category) => ({ accountId: account.id, categoryId: category!.id })),
  });
  return { accountId: account.id, categoryIds: [phone!.id, laptop!.id].toSorted() };
}

async function countStatements<T>(read: () => Promise<T>): Promise<{ value: T; count: number }> {
  statements.length = 0;
  const value = await read();
  return { value, count: statements.length };
}

describe('đường nóng: một câu SQL mỗi lượt đọc', () => {
  it('findActorSession: phiên kèm tài khoản', async () => {
    const { accountId } = await staffWithCategories();
    const session = await identity.createSession({
      accountId,
      refreshTokenHash: 'rt-hot',
      deviceName: 'Máy',
      ip: null,
      userAgent: null,
      expiresAt: LATER,
      at: NOW,
    });

    const { value, count } = await countStatements(() => identity.findActorSession(session.id));
    expect(count).toBe(1);
    expect(value).toMatchObject({ accountId, status: 'active', role: 'user' });
  });

  it('findStaffGrant: quyền staff kèm danh mục được giao', async () => {
    const { accountId, categoryIds } = await staffWithCategories();

    const { value, count } = await countStatements(() => platform.findStaffGrant(accountId));
    expect(count).toBe(1);
    expect(value).toEqual({ status: 'active', scopes: ['support'], categoryIds });
  });
});
