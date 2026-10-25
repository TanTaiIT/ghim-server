import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import {
  addMember,
  api,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { listingApi, liveListingOf, setCategoryEnabled } from './listing-http-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec `listing/saved-listings` (change add-saved-listings) qua HTTP. App ở T1 để tin lên sàn chung ở mức đầy đủ; mỗi ca
 * một người lưu riêng nên danh sách không lẫn nhau.
 */
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;
let seller: TestUser;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: createInterimTrust('T1'),
    screening: interimScreening,
  });
  await app.ready();
  master = await newMaster(app);
  seller = await newUser(app);
});

afterAll(async () => {
  await app.close();
});

const save = (user: TestUser | null, id: string) =>
  listingApi(app, 'PUT', `/me/saved-listings/${id}`, user);
const unsave = (user: TestUser, id: string) =>
  listingApi(app, 'DELETE', `/me/saved-listings/${id}`, user);
const savedIds = async (user: TestUser): Promise<string[]> => {
  const res = await listingApi(app, 'GET', '/me/saved-listings/ids', user);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data as string[];
};
const savedPage = async (user: TestUser, query = '') => {
  const res = await listingApi(app, 'GET', `/me/saved-listings${query}`, user);
  expect(res.statusCode, res.body).toBe(200);
  const data = res.json().data as { items: { id: string }[]; nextCursor: string | null };
  return { ids: data.items.map((item) => item.id), nextCursor: data.nextCursor };
};
/** Mỗi lượt lưu một mốc giờ riêng: thứ tự "lưu gần nhất trước" không phụ thuộc tốc độ chạy test. */
const tick = () => {
  now = new Date(now.getTime() + 1000);
};

describe('lưu một tin', () => {
  it('lưu tin đang hiện → 204, có trong danh sách; lưu lại → 204, vẫn một lần', async () => {
    const buyer = await newUser(app);
    const live = await liveListingOf(app, seller);
    expect((await save(buyer, live.id)).statusCode).toBe(204);
    tick();
    expect((await save(buyer, live.id)).statusCode).toBe(204);
    expect((await savedPage(buyer)).ids).toEqual([live.id]);
    expect(await prisma.savedListing.count({ where: { accountId: buyer.id } })).toBe(1);
  });

  it('khách lưu tin → 401 UNAUTHORIZED', async () => {
    const live = await liveListingOf(app, seller);
    const res = await save(null, live.id);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('tin "chỉ thành viên" của nhóm mình không ở → 404 NOT_FOUND như tin không tồn tại', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    const outsider = await newUser(app);
    const hidden = await save(outsider, live.id);
    const missing = await save(outsider, '01a00000-0000-7000-8000-000000000000');
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json().error).toEqual(missing.json().error);
  });

  it('tin đã xoá → 404 NOT_FOUND', async () => {
    const buyer = await newUser(app);
    const live = await liveListingOf(app, seller);
    expect((await listingApi(app, 'DELETE', `/listings/${live.id}`, seller)).statusCode).toBe(204);
    const res = await save(buyer, live.id);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('mã tin sai dạng → 400 VALIDATION_ERROR', async () => {
    const buyer = await newUser(app);
    const res = await save(buyer, 'l-xt30');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('bỏ lưu', () => {
  it('bỏ lưu → 204, tin không còn; bỏ lưu tin chưa lưu → 204, danh sách không đổi', async () => {
    const buyer = await newUser(app);
    const [a, b] = [await liveListingOf(app, seller), await liveListingOf(app, seller)];
    await save(buyer, a.id);
    tick();
    await save(buyer, b.id);
    expect((await unsave(buyer, a.id)).statusCode).toBe(204);
    expect((await savedPage(buyer)).ids).toEqual([b.id]);
    expect((await unsave(buyer, a.id)).statusCode).toBe(204);
    expect((await savedPage(buyer)).ids).toEqual([b.id]);
  });
});

describe('danh sách tin đã lưu', () => {
  it('lưu gần nhất trước, theo trang con trỏ', async () => {
    const buyer = await newUser(app);
    const [a, b, c] = [
      await liveListingOf(app, seller),
      await liveListingOf(app, seller),
      await liveListingOf(app, seller),
    ];
    await save(buyer, a.id);
    tick();
    await save(buyer, b.id);
    tick();
    await save(buyer, c.id);
    const page1 = await savedPage(buyer, '?limit=2');
    expect(page1.ids).toEqual([c.id, b.id]);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await savedPage(buyer, `?limit=2&cursor=${page1.nextCursor}`);
    expect(page2).toEqual({ ids: [a.id], nextCursor: null });
  });

  it('tin đã bán thôi có trong danh sách', async () => {
    const buyer = await newUser(app);
    const live = await liveListingOf(app, seller);
    await save(buyer, live.id);
    expect((await listingApi(app, 'POST', `/listings/${live.id}/sold`, seller)).statusCode).toBe(
      200,
    );
    expect((await savedPage(buyer)).ids).toEqual([]);
    expect(await savedIds(buyer)).toEqual([live.id]);
  });

  it('tin tạm ẩn vì danh mục tắt thì vắng, danh mục bật lại thì có lại', async () => {
    const buyer = await newUser(app);
    const live = await liveListingOf(app, seller);
    await save(buyer, live.id);
    const categoryId = live.categoryId as string;
    await setCategoryEnabled(app, master, categoryId, false);
    await deliverAll(app);
    expect((await savedPage(buyer)).ids).toEqual([]);
    await setCategoryEnabled(app, master, categoryId, true);
    await deliverAll(app);
    expect((await savedPage(buyer)).ids).toEqual([live.id]);
  });

  it('thành viên lưu tin "chỉ thành viên" rồi rời nhóm → tin vắng khỏi danh sách', async () => {
    const group = await createActiveGroup(app, { master });
    const poster = await addMember(app, group.groupId);
    const reader = await addMember(app, group.groupId);
    const live = await liveListingOf(app, poster, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    expect((await save(reader, live.id)).statusCode).toBe(204);
    expect((await savedPage(reader)).ids).toEqual([live.id]);
    expect(
      (await api(app, 'POST', `/groups/${group.groupId}/leave`, reader.token)).statusCode,
    ).toBe(204);
    expect((await savedPage(reader)).ids).toEqual([]);
  });

  it('khách xem danh sách → 401 UNAUTHORIZED', async () => {
    const res = await listingApi(app, 'GET', '/me/saved-listings', null);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('mã các tin đã lưu', () => {
  it('trả đúng mã các tin đã lưu', async () => {
    const buyer = await newUser(app);
    const [a, b] = [await liveListingOf(app, seller), await liveListingOf(app, seller)];
    await save(buyer, a.id);
    tick();
    await save(buyer, b.id);
    expect((await savedIds(buyer)).toSorted()).toEqual([a.id, b.id].toSorted());
  });
});

describe('không ai khác biết ai lưu tin', () => {
  it('người bán xem tin và danh sách tin của mình: không nêu người lưu hay số lượt lưu', async () => {
    const owner = await newUser(app);
    const buyer = await newUser(app);
    const live = await liveListingOf(app, owner);
    await save(buyer, live.id);
    const paths = [`/listings/${live.id}`, '/me/listings'];
    const responses = await Promise.all(paths.map((path) => listingApi(app, 'GET', path, owner)));
    for (const [i, res] of responses.entries()) {
      expect(res.statusCode, paths[i]).toBe(200);
      expect(res.body).not.toContain(buyer.id);
      expect(res.body).not.toMatch(/saved|saves/i);
    }
  });
});

describe('xoá tài khoản', () => {
  it('xoá tài khoản bỏ mọi tin đã lưu', async () => {
    const buyer = await newUser(app);
    await save(buyer, (await liveListingOf(app, seller)).id);
    await save(buyer, (await liveListingOf(app, seller)).id);
    expect(await prisma.savedListing.count({ where: { accountId: buyer.id } })).toBe(2);
    expect((await api(app, 'DELETE', '/me', buyer.token)).statusCode).toBe(204);
    await deliverAll(app);
    expect(await prisma.savedListing.count({ where: { accountId: buyer.id } })).toBe(0);
  });
});
