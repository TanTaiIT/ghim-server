import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
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
import {
  liveListingOf,
  machinePass,
  setCategoryEnabled,
  someRegion,
  submitted,
} from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec `listing/saved-searches` (change add-saved-searches) qua HTTP và luồng thật: sự kiện tin lên bảng do `listing`
 * phát, bên nghe thật của `notification`, hộp thư trên DB. Mỗi ca một người lưu riêng, từ khoá riêng.
 */
const MATCH = 'listing.saved_search.match';
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

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const saveSearch = (user: TestUser | null, body: object) =>
  api(app, 'POST', '/me/saved-searches', user?.token, body);
const list = async (user: TestUser) => {
  const res = await api(app, 'GET', '/me/saved-searches', user.token);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data as { id: string; q: string }[];
};
const inbox = (user: TestUser) =>
  prisma.notification.findMany({
    where: { recipientId: user.id, type: MATCH },
    orderBy: { createdAt: 'asc' },
  });
const posted = async (user: TestUser, fields: Record<string, unknown>) => {
  const live = await liveListingOf(app, user, fields);
  await deliverAll(app);
  return live;
};

describe('lưu một lượt tìm', () => {
  it('lưu mới → 201, có trong danh sách; lưu lại khác hoa thường, dấu → 200 lượt cũ, không thêm dòng', async () => {
    const buyer = await newUser(app);
    const categoryId = await seedCategory();
    const first = await saveSearch(buyer, { q: 'Điện thoại Samsung', categoryId });
    expect(first.statusCode, first.body).toBe(201);
    const again = await saveSearch(buyer, { q: 'dien thoai SAMSUNG', categoryId });
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().data.id).toBe(first.json().data.id);
    expect((await list(buyer)).map((s) => s.q)).toEqual(['Điện thoại Samsung']);
  });

  it('thiếu từ khoá, giá từ lớn hơn giá đến → 400 VALIDATION_ERROR', async () => {
    const buyer = await newUser(app);
    const bodies = [{ q: '   ' }, { q: 'tủ lạnh', priceMin: 5_000_000, priceMax: 1_000_000 }];
    for (const res of await Promise.all(bodies.map((body) => saveSearch(buyer, body)))) {
      expect(res.statusCode, res.body).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(await list(buyer)).toEqual([]);
  });

  it('đã lưu 10 lượt, lưu lượt thứ 11 → 409 CONFLICT, giữ 10 lượt', async () => {
    const buyer = await newUser(app);
    await sequentially([...Array(10).keys()], async (i) => {
      expect((await saveSearch(buyer, { q: `tu khoa tran ${i}` })).statusCode).toBe(201);
    });
    const res = await saveSearch(buyer, { q: 'tu khoa tran 10' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');
    expect(await list(buyer)).toHaveLength(10);
  });

  it('khách → 401 UNAUTHORIZED', async () => {
    const res = await saveSearch(null, { q: 'xe máy' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('xem và xoá lượt tìm đã lưu', () => {
  it('xoá lượt của mình → 204; xoá lượt của người khác → 404 NOT_FOUND, lượt đó còn', async () => {
    const [owner, other] = [await newUser(app), await newUser(app)];
    const { id } = (await saveSearch(owner, { q: 'bàn học' })).json().data as { id: string };
    const foreign = await api(app, 'DELETE', `/me/saved-searches/${id}`, other.token);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error.code).toBe('NOT_FOUND');
    expect(await list(owner)).toHaveLength(1);
    expect((await api(app, 'DELETE', `/me/saved-searches/${id}`, owner.token)).statusCode).toBe(
      204,
    );
    expect(await list(owner)).toEqual([]);
  });
});

describe('báo khi có tin mới khớp lượt tìm', () => {
  it('tin mới khớp → nhóm "tìm kiếm đã lưu", có nhắc; ba tin trước khi đọc → một dòng ghi 3 tin mới', async () => {
    const buyer = await newUser(app);
    await saveSearch(buyer, { q: 'galaxy s21' });
    await posted(seller, { title: 'Samsung Galaxy S21 cũ' });
    const [first] = await inbox(buyer);
    expect(first).toMatchObject({
      category: 'saved_searches',
      title: 'Tìm kiếm «galaxy s21»',
      body: '«Samsung Galaxy S21 cũ» khớp tìm kiếm của bạn.',
      alert: true,
      count: 1,
    });
    await posted(seller, { title: 'Galaxy S21 Ultra' });
    await posted(seller, { title: 'Ốp lưng Galaxy S21' });
    expect(await inbox(buyer)).toEqual([
      expect.objectContaining({ count: 3, body: '3 tin mới khớp tìm kiếm của bạn.' }),
    ]);
  });

  it('tin ở tỉnh khác bộ lọc → không báo', async () => {
    const buyer = await newUser(app);
    const region = await someRegion(app);
    const elsewhere = await prisma.ward.findFirstOrThrow({
      where: { provinceCode: { not: region.provinceCode } },
    });
    await saveSearch(buyer, { q: 'máy khâu', provinceCode: elsewhere.provinceCode });
    await posted(seller, { title: 'Máy khâu Singer' });
    expect(await inbox(buyer)).toEqual([]);
  });

  it('tin chỉ hiện hạn chế, tin trong nhóm, tin của chính mình → không báo', async () => {
    const buyer = await newUser(app);
    await saveSearch(buyer, { q: 'đàn guitar' });
    await machinePass(app, seller, await submitted(app, seller, { title: 'Đàn guitar gỗ' }), true);
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    await liveListingOf(app, member, {
      title: 'Đàn guitar điện',
      placement: 'members_only',
      groupId: group.groupId,
    });
    await liveListingOf(app, buyer, { title: 'Đàn guitar của tôi' });
    await deliverAll(app);
    expect(await inbox(buyer)).toEqual([]);
  });

  it('tin đã báo, tạm ẩn vì danh mục tắt rồi hiện lại → không báo lần nữa', async () => {
    const buyer = await newUser(app);
    await saveSearch(buyer, { q: 'nồi chiên' });
    const live = await posted(seller, { title: 'Nồi chiên không dầu' });
    const categoryId = live.categoryId as string;
    await setCategoryEnabled(app, master, categoryId, false);
    await deliverAll(app);
    await setCategoryEnabled(app, master, categoryId, true);
    await deliverAll(app);
    expect((await inbox(buyer)).map((row) => row.count)).toEqual([1]);
  });
});

describe('xoá tài khoản', () => {
  it('bỏ mọi lượt tìm đã lưu, tin khớp sau đó không báo', async () => {
    const buyer = await newUser(app);
    await saveSearch(buyer, { q: 'xe đạp gấp' });
    expect((await api(app, 'DELETE', '/me', buyer.token)).statusCode).toBe(204);
    await deliverAll(app);
    expect(await prisma.savedSearch.count({ where: { accountId: buyer.id } })).toBe(0);
    await posted(seller, { title: 'Xe đạp gấp Fornix' });
    expect(await inbox(buyer)).toEqual([]);
  });
});
