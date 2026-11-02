import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { listingApi } from './listing-http-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec `listing/activity-history` (change add-home-suggestions) qua HTTP: lượt xem ghi ở `GET /listings/:id`, lượt tìm ở
 * trang đầu `GET /listings`, công tắc trên `/me`, xoá lịch sử, xoá tài khoản, bước dọn theo hạn. Tin dựng thẳng vào DB —
 * luồng đăng tin không phải thứ đang kiểm.
 */
const MINUTE = 60_000;
const DAY = 86_400_000;
let now = TEST_NOW;
let app: FastifyInstance;
let seller: TestUser;
let category: string;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now });
  await app.ready();
  seller = await newUser(app);
  category = await seedCategory();
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const later = (ms: number) => {
  now = new Date(now.getTime() + ms);
};
const listingOf = (over: Parameters<typeof liveListing>[2] = {}) =>
  seedListing(liveListing(seller.id, category, over));
const open = async (user: TestUser | null, id: string) => {
  const res = await listingApi(app, 'GET', `/listings/${id}`, user);
  expect(res.statusCode, res.body).toBe(200);
};
const search = async (user: TestUser, query: string) => {
  const res = await listingApi(app, 'GET', `/listings?${query}`, user);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data as { items: { id: string }[]; nextCursor: string | null };
};
const viewsOf = (user: TestUser) => prisma.listingView.findMany({ where: { accountId: user.id } });
const searchesOf = (user: TestUser) =>
  prisma.searchHistory.findMany({ where: { accountId: user.id }, orderBy: { searchedAt: 'desc' } });
const setSwitch = async (user: TestUser, on: boolean) => {
  const res = await api(app, 'PATCH', '/me', user.token, { personalizedSuggestions: on });
  expect(res.statusCode, res.body).toBe(200);
  expect(res.json().data.personalizedSuggestions).toBe(on);
};
const q = (text: string) => `q=${encodeURIComponent(text)}`;

describe('lịch sử xem', () => {
  it('mở tin của người khác: một dòng, số lần 1; mở lại: vẫn một dòng, số lần 2, mốc là lúc mở lại', async () => {
    const buyer = await newUser(app);
    const listing = await listingOf();
    await open(buyer, listing.id);
    expect(await viewsOf(buyer)).toMatchObject([
      { listingId: listing.id, viewCount: 1, lastViewedAt: TEST_NOW },
    ]);
    later(5 * MINUTE);
    await open(buyer, listing.id);
    expect(await viewsOf(buyer)).toMatchObject([
      { listingId: listing.id, viewCount: 2, lastViewedAt: now },
    ]);
  });

  it('tin của chính mình, khách: không ghi', async () => {
    const listing = await listingOf();
    await open(seller, listing.id);
    await open(null, listing.id);
    expect(await prisma.listingView.count({ where: { listingId: listing.id } })).toBe(0);
  });

  it('đã có 200 tin rồi mở tin mới: còn 200, tin có mốc cũ nhất bị bỏ', async () => {
    const buyer = await newUser(app);
    const rows = await prisma.listing.createManyAndReturn({
      data: Array.from({ length: 200 }, () => liveListing(seller.id, category)),
    });
    await prisma.listingView.createMany({
      data: rows.map((row, index) => ({
        accountId: buyer.id,
        listingId: row.id,
        lastViewedAt: new Date(TEST_NOW.getTime() - (200 - index) * MINUTE),
      })),
    });
    const fresh = await listingOf();
    await open(buyer, fresh.id);
    const kept = new Set((await viewsOf(buyer)).map((row) => row.listingId));
    expect(kept.size).toBe(200);
    expect(kept.has(fresh.id)).toBe(true);
    expect(kept.has(rows[0]?.id ?? '')).toBe(false);
  });
});

describe('lịch sử tìm kiếm', () => {
  it('tìm có từ khoá ở một tỉnh: một lượt, từ khoá đã gấp dấu và tỉnh đó', async () => {
    const buyer = await newUser(app);
    await search(buyer, `${q('Xe máy  Honda')}&provinceCode=79`);
    expect(await searchesOf(buyer)).toMatchObject([
      { qFolded: 'XE MAY HONDA', provinceCode: 79, categoryId: null, priceMin: null },
    ]);
  });

  it('tìm lại y hệt sau 3 phút chỉ dời mốc; sau hơn 10 phút là lượt mới', async () => {
    const buyer = await newUser(app);
    await search(buyer, `categoryId=${category}&priceMax=5000000`);
    later(3 * MINUTE);
    await search(buyer, `categoryId=${category}&priceMax=5000000`);
    expect(await searchesOf(buyer)).toMatchObject([{ searchedAt: now, priceMax: 5_000_000n }]);
    later(11 * MINUTE);
    await search(buyer, `categoryId=${category}&priceMax=5000000`);
    expect(await searchesOf(buyer)).toHaveLength(2);
  });

  it('trang kế của lượt tìm, bảng tin không lọc: không ghi thêm', async () => {
    const buyer = await newUser(app);
    await Promise.all([
      listingOf({ title: 'Tủ lạnh mini', searchFolded: 'TU LANH MINI' }),
      listingOf({ title: 'Tủ lạnh Sanyo', searchFolded: 'TU LANH SANYO' }),
    ]);
    const first = await search(buyer, `${q('tủ lạnh')}&limit=1`);
    expect(first.nextCursor).not.toBeNull();
    later(20 * MINUTE);
    await search(buyer, `${q('tủ lạnh')}&limit=1&cursor=${first.nextCursor ?? ''}`);
    await search(buyer, 'limit=5');
    expect(await searchesOf(buyer)).toHaveLength(1);
  });
});

describe('công tắc "Gợi ý theo hoạt động"', () => {
  it('mặc định bật; tắt thì không ghi xem hay tìm; bật lại thì lịch sử cũ còn', async () => {
    const buyer = await newUser(app);
    const me = await api(app, 'GET', '/me', buyer.token);
    expect(me.json().data.personalizedSuggestions).toBe(true);
    const before = await listingOf();
    await open(buyer, before.id);

    await setSwitch(buyer, false);
    await open(buyer, (await listingOf()).id);
    await search(buyer, q('tủ lạnh'));
    expect(await viewsOf(buyer)).toHaveLength(1);
    expect(await searchesOf(buyer)).toHaveLength(0);

    await setSwitch(buyer, true);
    expect((await viewsOf(buyer)).map((row) => row.listingId)).toEqual([before.id]);
  });

  it('hồ sơ công khai không có công tắc', async () => {
    const res = await api(app, 'GET', `/users/${seller.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('personalizedSuggestions');
  });
});

describe('xoá lịch sử', () => {
  it('204: lịch sử xem và tìm trống; tin đã lưu và tìm kiếm đã lưu còn nguyên', async () => {
    const buyer = await newUser(app);
    const listing = await listingOf();
    await open(buyer, listing.id);
    await search(buyer, q('xe đạp'));
    expect(
      (await listingApi(app, 'PUT', `/me/saved-listings/${listing.id}`, buyer)).statusCode,
    ).toBe(204);
    expect(
      (await api(app, 'POST', '/me/saved-searches', buyer.token, { q: 'xe đạp' })).statusCode,
    ).toBe(201);

    const res = await api(app, 'DELETE', '/me/activity-history', buyer.token);
    expect(res.statusCode).toBe(204);
    expect(await viewsOf(buyer)).toHaveLength(0);
    expect(await searchesOf(buyer)).toHaveLength(0);
    expect(await prisma.savedListing.count({ where: { accountId: buyer.id } })).toBe(1);
    expect(await prisma.savedSearch.count({ where: { accountId: buyer.id } })).toBe(1);
  });

  it('khách → 401', async () => {
    expect((await api(app, 'DELETE', '/me/activity-history')).statusCode).toBe(401);
  });

  it('xoá tài khoản xoá luôn lịch sử', async () => {
    const buyer = await newUser(app);
    await open(buyer, (await listingOf()).id);
    await search(buyer, q('xe đạp'));
    expect((await api(app, 'DELETE', '/me', buyer.token)).statusCode).toBe(204);
    await deliverAll(app);
    expect(await viewsOf(buyer)).toHaveLength(0);
    expect(await searchesOf(buyer)).toHaveLength(0);
  });
});

describe('hạn lưu và quyền đọc', () => {
  it('lượt dọn hằng ngày xoá lượt xem, lượt tìm cũ hơn 90 ngày; phần mới hơn còn', async () => {
    const buyer = await newUser(app);
    const old = await listingOf();
    await open(buyer, old.id);
    await search(buyer, q('máy giặt'));
    // Phiên hết hạn sau ngần ấy ngày không dùng — lượt xem sau ghi thẳng qua repository.
    const recent = await listingOf();
    await repositories.activity.recordView(buyer.id, recent.id, new Date(now.getTime() + 60 * DAY));
    later(91 * DAY);

    await app.modules.ops.runRetention({ budgetMs: 60_000 });
    expect((await viewsOf(buyer)).map((row) => row.listingId)).toEqual([recent.id]);
    expect(await searchesOf(buyer)).toHaveLength(0);
  });

  it('thẻ tài khoản ở bàn vận hành không có lịch sử xem hay tìm', async () => {
    const master = await newMaster(app);
    const buyer = await newUser(app);
    await open(buyer, (await listingOf({ title: 'Máy ảnh Canon' })).id);
    const res = await api(app, 'GET', `/ops/accounts/${buyer.id}`, master.token);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.body).not.toMatch(/viewCount|searchHistory|listingViews|Canon/);
  });
});
