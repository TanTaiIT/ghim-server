import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { OpsAccountCardDto, OpsAccountDto } from '../src/modules/ops/ops.schema.js';
import { prisma, truncateAll } from './db-helpers.js';
import { newMaster, newUser, type TestUser } from './group-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Spec `ops/account-directory` qua HTTP. File xoá sạch DB của worker trước khi dựng app: `total` đếm mọi tài khoản chưa
 * xoá, kể cả của file khác còn sót.
 */
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(TEST_NOW.getTime() - days * DAY_MS);

let app: FastifyInstance;
let master: TestUser;
let support: TestUser;
let categoryStaff: TestUser;
let plain: TestUser;
let binh: { id: string };
let locked: { id: string };
let deleted: { id: string };

/** Tài khoản dựng thẳng vào DB với mốc tạo và trạng thái cố ý (CHECK: khoá cần `lockedAt` + `statusBeforeLock`, xoá cần `deletedAt`). */
const seed = (
  data: Pick<Prisma.AccountUncheckedCreateInput, 'displayName' | 'email' | 'createdAt'> &
    Partial<Prisma.AccountUncheckedCreateInput>,
) =>
  prisma.account.create({
    data: {
      emailNormalized: data.email,
      emailHash: `h-${data.email}`,
      passwordHash: 'argon2id-gia',
      status: 'active',
      ...data,
    },
  });

beforeAll(async () => {
  await truncateAll();
  app = await buildTestApp({ clock: () => TEST_NOW });
  await app.ready();
  master = await newMaster(app);
  support = await newUser(app);
  await grantStaff(support.id, ['support']);
  categoryStaff = await newUser(app);
  await grantStaff(categoryStaff.id, [], [await seedCategory()]);
  plain = await newUser(app);
  binh = await seed({
    displayName: 'Bình Người Mua',
    email: 'app.buyer@ghim.local',
    createdAt: daysAgo(3),
  });
  locked = await seed({
    displayName: 'Người Bị Khoá',
    email: 'khoa@ghim.local',
    createdAt: daysAgo(2),
    status: 'locked',
    statusBeforeLock: 'active',
    lockedAt: daysAgo(1),
    lockedReason: 'Lừa đặt cọc qua chuyển khoản',
  });
  deleted = await seed({
    displayName: 'Bình Người Mua Cũ',
    email: 'cu@ghim.local',
    createdAt: daysAgo(5),
    status: 'deleted',
    deletedAt: daysAgo(4),
  });
});

afterAll(() => app.close());

const api = (token: string, url: string) =>
  app.inject({
    method: 'GET',
    url: `/api/v1${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
const listOf = async (token: string, query: string) => {
  const res = await api(token, `/ops/accounts${query}`);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data as {
    items: OpsAccountDto[];
    total: number;
    totalPages: number;
    page: number;
    limit: number;
  };
};

describe('Danh bạ tài khoản cho bàn vận hành', () => {
  it('mới nhất trước, theo trang; tài khoản đã xoá không được đếm', async () => {
    // Helper dựng danh mục cũng tạo một tài khoản: đếm từ DB thay vì đếm tay.
    const alive = await prisma.account.count({ where: { status: { not: 'deleted' } } });
    const page = await listOf(master.token, '?limit=2');
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(alive);
    expect(page.totalPages).toBe(Math.ceil(alive / 2));
    const at = page.items.map((item) => new Date(item.createdAt).getTime());
    expect(at[0]).toBeGreaterThanOrEqual(at[1] ?? 0);
    expect(page.items.every((item) => item.id !== deleted.id)).toBe(true);
  });

  it('tìm theo tên không phân biệt hoa thường; tên trùng của tài khoản đã xoá không ra', async () => {
    const page = await listOf(master.token, `?q=${encodeURIComponent('bình người mua')}`);
    expect(page.items.map((item) => item.id)).toEqual([binh.id]);
  });

  it('staff có việc hỗ trợ tìm theo email: dòng có email, mức tin cậy, cờ cảnh cáo', async () => {
    const page = await listOf(support.token, '?q=app.buyer');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: binh.id,
      displayName: 'Bình Người Mua',
      email: 'app.buyer@ghim.local',
      role: 'user',
      status: 'active',
      lockedAt: null,
      lockedReason: null,
      tier: 'T0',
      struck: false,
    });
  });

  it('lọc đang khoá: kèm lúc khoá và lý do; tài khoản đang hoạt động không có', async () => {
    const page = await listOf(master.token, '?status=locked');
    expect(page.items.map((item) => item.id)).toEqual([locked.id]);
    expect(page.items[0]).toMatchObject({
      status: 'locked',
      lockedAt: daysAgo(1).toISOString(),
      lockedReason: 'Lừa đặt cọc qua chuyển khoản',
    });
  });

  it('staff chỉ có danh mục, hay người thường: 403 FORBIDDEN', async () => {
    const responses = await Promise.all(
      [categoryStaff, plain].map((who) => api(who.token, '/ops/accounts')),
    );
    for (const res of responses) {
      expect(res.statusCode, res.body).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    }
  });
});

describe('Thẻ một tài khoản', () => {
  it('tài khoản đang khoá: trạng thái, lúc khoá, lý do, mức, điểm vi phạm', async () => {
    const res = await api(master.token, `/ops/accounts/${locked.id}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data as OpsAccountCardDto).toMatchObject({
      id: locked.id,
      displayName: 'Người Bị Khoá',
      status: 'locked',
      lockedReason: 'Lừa đặt cọc qua chuyển khoản',
      tier: 'T0',
      struck: false,
      strikePoints: 0,
    });
  });

  it('mã không có, hay tài khoản đã xoá: 404 NOT_FOUND', async () => {
    const responses = await Promise.all(
      [randomUUID(), deleted.id].map((id) => api(master.token, `/ops/accounts/${id}`)),
    );
    for (const res of responses) {
      expect(res.statusCode, res.body).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });
});
