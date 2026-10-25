import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { newUser, type TestUser } from './group-helpers.js';
import { listingApi, liveListingOf } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec `listing/visibility` "Sắp xếp bảng tin, danh mục, tìm kiếm" (change add-feed-sort) qua HTTP. Mỗi ca một danh mục
 * riêng nên danh sách chỉ gồm tin của ca đó; đồng hồ nhích giữa các tin để vị trí trên bảng tin khác nhau.
 */
let now = TEST_NOW;
let app: FastifyInstance;
let seller: TestUser;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: createInterimTrust('T1'),
    screening: interimScreening,
  });
  await app.ready();
  seller = await newUser(app);
});

afterAll(() => app.close());

/** Đăng lần lượt các tin theo giá, mỗi tin lên bảng sau tin trước một giây. Trả mã theo thứ tự đăng. */
async function postPrices(categoryId: string, prices: number[]): Promise<string[]> {
  const ids: string[] = [];
  await sequentially(prices, async (price) => {
    now = new Date(now.getTime() + 1000);
    ids.push(
      (await liveListingOf(app, seller, { categoryId, price, title: `Ghế gỗ ${price}` })).id,
    );
  });
  return ids;
}

const feed = async (query: string) => {
  const res = await listingApi(app, 'GET', `/listings?${query}`, null);
  expect(res.statusCode, res.body).toBe(200);
  const data = res.json().data as { items: { id: string }[]; nextCursor: string | null };
  return { ids: data.items.map((item) => item.id), nextCursor: data.nextCursor };
};

describe('sắp xếp bảng tin, danh mục, tìm kiếm', () => {
  it('mặc định mới nhất theo vị trí; giá tăng dần; giá giảm dần', async () => {
    const categoryId = await seedCategory();
    const [a, b, c] = await postPrices(categoryId, [300_000, 100_000, 200_000]);
    expect((await feed(`categoryId=${categoryId}`)).ids).toEqual([c, b, a]);
    expect((await feed(`categoryId=${categoryId}&sort=price_asc`)).ids).toEqual([b, c, a]);
    expect((await feed(`categoryId=${categoryId}&sort=price_desc`)).ids).toEqual([a, c, b]);
  });

  it('có từ khoá vẫn sắp theo giá được', async () => {
    const categoryId = await seedCategory();
    const [a, b] = await postPrices(categoryId, [500_000, 50_000]);
    expect((await feed(`q=ghe&categoryId=${categoryId}&sort=price_asc`)).ids).toEqual([b, a]);
  });

  it('theo trang với con trỏ: không lặp, không sót; cùng giá thì xếp theo mã', async () => {
    const categoryId = await seedCategory();
    const ids = await postPrices(categoryId, [200_000, 100_000, 100_000, 300_000]);
    const [x, y, z, w] = ids;
    const sameAscending = [y, z].toSorted();
    const first = await feed(`categoryId=${categoryId}&sort=price_asc&limit=2`);
    expect(first.ids).toEqual(sameAscending);
    const second = await feed(
      `categoryId=${categoryId}&sort=price_asc&limit=2&cursor=${first.nextCursor}`,
    );
    expect(second).toEqual({ ids: [x, w], nextCursor: null });
    const down = await feed(`categoryId=${categoryId}&sort=price_desc&limit=3`);
    expect(down.ids).toEqual([w, x, sameAscending[1]]);
    const rest = await feed(
      `categoryId=${categoryId}&sort=price_desc&limit=3&cursor=${down.nextCursor}`,
    );
    expect(rest).toEqual({ ids: [sameAscending[0]], nextCursor: null });
  });

  it('cách xếp không có → 400 VALIDATION_ERROR', async () => {
    const res = await listingApi(app, 'GET', '/listings?sort=nearest', null);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
