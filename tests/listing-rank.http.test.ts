import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { interimScreening } from './fakes/listing-ports.fake.js';
import { api, newUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { listingApi } from './listing-http-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Delta của prepare-promotions: bảng tin xếp theo vị trí xếp hạng riêng (`rank_at`), hạn nổi bật trống, phí đăng tin 0 Xu
 * ở bảng uy tín (spec listing/visibility "Vị trí trên bảng tin", trust/seller-dashboard "Phí đăng tin").
 */
const DAY_MS = 86_400_000;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp({ screening: interimScreening });
  await app.ready();
});

afterAll(() => app.close());

const at = (days: number) => new Date(TEST_NOW.getTime() + days * DAY_MS);
const idsOf = (res: { json(): unknown }) =>
  (res.json() as { data: { items: { id: string }[]; nextCursor: string | null } }).data;

describe('Vị trí trên bảng tin', () => {
  it('tin lên bảng sau đứng trên tin lên bảng trước, trên bảng tin lẫn danh mục; trang kế tiếp theo con trỏ không lặp không sót', async () => {
    const owner = await newUser(app);
    const category = await seedCategory();
    const older = await seedListing(liveListing(owner.id, category, { firstLiveAt: at(-2) }));
    const middle = await seedListing(liveListing(owner.id, category, { firstLiveAt: at(-1) }));
    const newest = await seedListing(liveListing(owner.id, category, { firstLiveAt: at(0) }));
    for (const row of [older, middle, newest]) expect(row.rankAt).toEqual(row.firstLiveAt);

    const first = idsOf(
      await listingApi(app, 'GET', `/listings?categoryId=${category}&limit=2`, null),
    );
    expect(first.items.map((item) => item.id)).toEqual([newest.id, middle.id]);
    expect(first.nextCursor).not.toBeNull();
    const second = idsOf(
      await listingApi(
        app,
        'GET',
        `/listings?categoryId=${category}&limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
        null,
      ),
    );
    expect(second.items.map((item) => item.id)).toEqual([older.id]);
    expect(second.nextCursor).toBeNull();

    const feed = idsOf(await listingApi(app, 'GET', '/listings?limit=50', null));
    const positions = [newest.id, middle.id, older.id].map((id) =>
      feed.items.findIndex((item) => item.id === id),
    );
    expect(positions.every((index) => index >= 0)).toBe(true);
    expect(positions).toEqual([...positions].toSorted((a, b) => a - b));
  });

  it('tin đang hiển thị mang `featuredUntil` null — chưa có gói nổi bật', async () => {
    const owner = await newUser(app);
    const listing = await seedListing(liveListing(owner.id, await seedCategory()));
    const res = await listingApi(app, 'GET', `/listings/${listing.id}`, null);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { featuredUntil: unknown } }).data.featuredUntil).toBeNull();
  });
});

describe('Phí đăng tin', () => {
  it('bảng uy tín cho biết phí một lượt đăng là 0 Xu', async () => {
    const user = await newUser(app);
    const res = await api(app, 'GET', '/me/trust', user.token);
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { data: { quota: { fee: unknown } } }).data.quota.fee).toEqual({
      amount: 0,
      currency: 'xu',
    });
  });
});
