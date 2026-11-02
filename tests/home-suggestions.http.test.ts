import type { Listing, Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import { api, newUser, type TestUser } from './group-helpers.js';
import {
  liveListing,
  seedCategory,
  seedGroup,
  seedListing,
  seedMember,
} from './listing-helpers.js';
import { listingApi } from './listing-http-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec `listing/suggestions` (change add-home-suggestions) qua HTTP. Mỗi ca dùng danh mục và tỉnh riêng nên hồ sơ quan
 * tâm và phần "được quan tâm nhiều" của ca này không lẫn tin của ca khác.
 */
const DAY = 86_400_000;
let now = TEST_NOW;
let app: FastifyInstance;
let seller: TestUser;
let provinces: number[] = [];
const nextProvince = (): number => {
  const code = provinces.shift();
  if (code === undefined) throw new Error('Hết tỉnh cho ca thử');
  return code;
};

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now });
  await app.ready();
  await app.modules.region.seedRegionsIfEmpty();
  provinces = (await prisma.province.findMany({ orderBy: { code: 'asc' } })).map((p) => p.code);
  seller = await newUser(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

type Overrides = Partial<Prisma.ListingUncheckedCreateInput>;
const listingIn = (category: string, over: Overrides = {}) =>
  seedListing(liveListing(seller.id, category, over));
const many = (count: number, category: string, over: Overrides = {}) =>
  Promise.all(Array.from({ length: count }, () => listingIn(category, over)));
const daysAgo = (days: number) => new Date(TEST_NOW.getTime() - days * DAY);

const suggestions = async (user: TestUser | null, query = '') => {
  const res = await listingApi(app, 'GET', `/listings/suggestions${query}`, user);
  expect(res.statusCode, res.body).toBe(200);
  const data = res.json().data as {
    items: { id: string }[];
    nextCursor: string | null;
    personalized: boolean;
  };
  return { ids: data.items.map((item) => item.id), ...data };
};
const saveBy = (accountId: string, listing: Listing, at = TEST_NOW) =>
  prisma.savedListing.create({ data: { accountId, listingId: listing.id, savedAt: at } });
const savers = async (listing: Listing, count: number, at = TEST_NOW) => {
  const accounts = await Promise.all(Array.from({ length: count }, () => seedAccount()));
  await Promise.all(accounts.map((account) => saveBy(account.id, listing, at)));
};
const askBy = (buyerId: string, listing: Listing) =>
  prisma.conversation.create({
    data: {
      listingId: listing.id,
      sellerId: listing.ownerId,
      buyerId,
      createdAt: now,
      lastActivityAt: now,
      buyerMessages: 1,
    },
  });
const open = async (user: TestUser, listing: Listing) => {
  expect((await listingApi(app, 'GET', `/listings/${listing.id}`, user)).statusCode).toBe(200);
};

describe('chưa có lịch sử — được quan tâm nhiều gần bạn', () => {
  it('khách ở một tỉnh: lượt lưu + 2 × lượt hỏi trong 14 ngày, cờ chưa cá nhân hoá; tỉnh khác không có', async () => {
    const category = await seedCategory();
    const here = nextProvince();
    const [p, q, s, old, elsewhere] = await Promise.all([
      listingIn(category, { provinceCode: here, firstLiveAt: daysAgo(3) }),
      listingIn(category, { provinceCode: here }),
      listingIn(category, { provinceCode: here, firstLiveAt: daysAgo(2) }),
      listingIn(category, { provinceCode: here, firstLiveAt: daysAgo(1) }),
      listingIn(category, { provinceCode: nextProvince() }),
    ]);
    await savers(p, 5);
    await savers(q, 1);
    const [a, b] = [await seedAccount(), await seedAccount()];
    await Promise.all([askBy(a.id, s), askBy(b.id, s)]);
    await savers(old, 10, daysAgo(20));
    await savers(elsewhere, 9);

    const page = await suggestions(null, `?provinceCode=${here}`);
    expect(page.personalized).toBe(false);
    expect(page.ids).toEqual([p.id, s.id, q.id, old.id]);
    expect(page.nextCursor).toBeNull();
  });

  it('người chưa có tín hiệu nào cũng như khách', async () => {
    const user = await newUser(app);
    expect((await suggestions(user)).personalized).toBe(false);
  });
});

describe('theo hồ sơ quan tâm', () => {
  it('đã lưu ba tin xe máy, xem một tin điện thoại: xe máy mới xếp trước điện thoại mới, cờ đã cá nhân hoá', async () => {
    const [bikes, phones] = [await seedCategory(), await seedCategory()];
    const city = nextProvince();
    const user = await newUser(app);
    const saved = await many(3, bikes, { provinceCode: city, firstLiveAt: daysAgo(5) });
    await Promise.all(saved.map((listing) => saveBy(user.id, listing)));
    await open(user, await listingIn(phones, { provinceCode: city, firstLiveAt: daysAgo(5) }));
    const [newPhone, newBike] = [
      await listingIn(phones, { provinceCode: city }),
      await listingIn(bikes, { provinceCode: city }),
    ];

    const page = await suggestions(user);
    expect(page.personalized).toBe(true);
    expect(page.ids.indexOf(newBike.id)).toBeLessThan(page.ids.indexOf(newPhone.id));
    expect(page.ids.indexOf(newPhone.id)).toBeGreaterThanOrEqual(0);
    for (const listing of saved) expect(page.ids).not.toContain(listing.id);
  });

  it('từng tìm "honda vision": tin chứa cụm đó ở danh mục khác có trong mục gợi ý', async () => {
    const user = await newUser(app);
    const query = `q=${encodeURIComponent('honda vision')}`;
    expect((await listingApi(app, 'GET', `/listings?${query}`, user)).statusCode).toBe(200);
    const match = await listingIn(await seedCategory(), {
      title: 'Xe Honda Vision 2021',
      searchFolded: 'XE HONDA VISION 2021',
    });
    const page = await suggestions(user);
    expect(page.personalized).toBe(true);
    expect(page.ids[0]).toBe(match.id);
  });

  it('không có tin đã lưu, đã hỏi, tin của chính mình, tin hạn chế, tin chỉ trong nhóm', async () => {
    const category = await seedCategory();
    const user = await newUser(app);
    const groupId = await seedGroup();
    await seedMember(groupId, user.id);
    const [saved, asked, mine, restricted, inGroup, shown] = await Promise.all([
      listingIn(category),
      listingIn(category),
      seedListing(liveListing(user.id, category)),
      listingIn(category, { restrictions: ['machine'] }),
      listingIn(category, { placement: 'members_only', groupId }),
      listingIn(category),
    ]);
    await saveBy(user.id, saved);
    await askBy(user.id, asked);

    const page = await suggestions(user);
    expect(page.personalized).toBe(true);
    expect(page.ids[0]).toBe(shown.id);
    for (const hidden of [saved, asked, mine, restricted, inGroup]) {
      expect(page.ids).not.toContain(hidden.id);
    }
  });

  it('hồ sơ chỉ khớp 8 tin: trang đầu có 8 tin đó rồi tới tin được quan tâm nhiều, không trùng', async () => {
    const category = await seedCategory();
    const user = await newUser(app);
    await saveBy(user.id, await listingIn(category));
    const matching = await many(8, category, { provinceCode: nextProvince() });
    const here = nextProvince();
    const [hot, warm] = await many(2, await seedCategory(), { provinceCode: here });
    if (!hot || !warm) throw new Error('thiếu tin');
    await savers(hot, 3);
    await savers(warm, 1);

    const page = await suggestions(user, `?provinceCode=${here}`);
    expect(new Set(page.ids.slice(0, 8))).toEqual(new Set(matching.map((listing) => listing.id)));
    expect(page.ids.slice(8)).toEqual([hot.id, warm.id]);
  });

  it('trang kế: 20 tin rồi con trỏ, trang sau nối tiếp không trùng, hết thì con trỏ rỗng', async () => {
    const category = await seedCategory();
    const user = await newUser(app);
    await saveBy(user.id, await listingIn(category));
    const matching = await many(25, category);
    const empty = `provinceCode=${nextProvince()}`;

    const first = await suggestions(user, `?${empty}`);
    expect(first.ids).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = await suggestions(user, `?${empty}&cursor=${first.nextCursor ?? ''}`);
    expect(second.ids).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.ids, ...second.ids])).toEqual(
      new Set(matching.map((listing) => listing.id)),
    );
  });

  it('tắt "Gợi ý theo hoạt động": trả như khách', async () => {
    const category = await seedCategory();
    const user = await newUser(app);
    await saveBy(user.id, await listingIn(category));
    await listingIn(category);
    expect((await suggestions(user)).personalized).toBe(true);
    const res = await api(app, 'PATCH', '/me', user.token, { personalizedSuggestions: false });
    expect(res.statusCode, res.body).toBe(200);
    expect((await suggestions(user)).personalized).toBe(false);
  });
});

describe('route', () => {
  it('con trỏ không do server phát → 400', async () => {
    const res = await listingApi(app, 'GET', '/listings/suggestions?cursor=abc', null);
    expect(res.statusCode).toBe(400);
  });

  it('dải "Tin nổi bật" giữ nguyên: tin đang nổi bật vẫn có trong dải', async () => {
    const featured = await listingIn(await seedCategory(), {
      featuredUntil: new Date(TEST_NOW.getTime() + 7 * DAY),
    });
    const res = await listingApi(app, 'GET', '/listings/featured', null);
    expect(res.statusCode).toBe(200);
    expect((res.json().data.items as { id: string }[]).map((item) => item.id)).toContain(
      featured.id,
    );
  });
});
