import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  createDraft,
  getOwn,
  groupSettings,
  listingApi,
  liveListingOf,
  machineHold,
  machinePass,
  type OwnListing,
  patch,
  signedInAt,
  submitted,
} from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec `listing/visibility` và delta `identity/profile` qua HTTP. App chính ở mức tin cậy T1 (tin lên bảng đầy đủ);
 * app thứ hai ở T0 — mặc định của test — cho các ca lý do "tài khoản mới". Hai app dùng chung một DB.
 * Mỗi ca dùng tiêu đề và danh mục riêng nên đọc bảng tin, tìm kiếm không lẫn tin của ca khác.
 */
const DAY_MS = 86_400_000;
let now = TEST_NOW;
let app: FastifyInstance;
let t0: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: createInterimTrust('T1'),
    screening: interimScreening,
  });
  t0 = await buildTestApp({ clock: () => now });
  await Promise.all([app.ready(), t0.ready()]);
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(async () => {
  await Promise.all([app.close(), t0.close()]);
});

type Viewer = TestUser | null;
const idsAt = async (url: string, viewer: Viewer = null): Promise<string[]> => {
  const res = await listingApi(app, 'GET', url, viewer);
  expect(res.statusCode, `${url} ${res.body}`).toBe(200);
  const data = res.json().data as { items?: { id: string }[] } | { id: string }[];
  return (Array.isArray(data) ? data : (data.items ?? [])).map((item) => item.id);
};
const opens = async (id: string, viewer: Viewer = null) =>
  (await listingApi(app, 'GET', `/listings/${id}`, viewer)).statusCode;
/** Từ khoá riêng của ca — tìm kiếm chung chỉ ra tin của chính ca đó. */
const uniqueWord = () => `ma${randomUUID().slice(0, 8)}`;

/** Các bề mặt một tin sàn chung có thể có mặt — mỗi bề mặt trả `true` nếu tin nằm trong đó. */
async function surfacesOf(listing: OwnListing, word: string, viewer: Viewer = null) {
  const sibling = await liveListingOf(app, await newUser(app), {
    categoryId: listing.categoryId,
    title: `Tin cùng danh mục ${uniqueWord()}`,
  });
  return {
    feed: (await idsAt(`/listings?categoryId=${listing.categoryId}`, viewer)).includes(listing.id),
    search: (await idsAt(`/listings?q=${word}`, viewer)).includes(listing.id),
    suggestions: (await idsAt(`/listings/${sibling.id}/suggestions`, viewer)).includes(listing.id),
    profile: (await idsAt(`/users/${listing.ownerId}/listings`, viewer)).includes(listing.id),
    link: (await opens(listing.id, viewer)) === 200,
  };
}

describe('Hai mức hiển thị', () => {
  it('tin hạn chế: không bảng tin, không gợi ý, không danh mục; có tìm kiếm, hồ sơ, đường link', async () => {
    const owner = await newUser(app);
    const word = uniqueWord();
    const limited = await machinePass(
      app,
      owner,
      await submitted(app, owner, { title: `Ghế ${word}` }),
      true,
    );
    expect(limited.restrictions).toEqual(['machine']);
    expect(await surfacesOf(limited, word)).toEqual({
      feed: false,
      search: true,
      suggestions: false,
      profile: true,
      link: true,
    });
  });

  it('tin đầy đủ: có trên bảng tin, tìm kiếm, gợi ý, hồ sơ', async () => {
    const owner = await newUser(app);
    const word = uniqueWord();
    const full = await liveListingOf(app, owner, { title: `Bàn ${word}` });
    expect(await surfacesOf(full, word)).toEqual({
      feed: true,
      search: true,
      suggestions: true,
      profile: true,
      link: true,
    });
  });
});

describe('Lý do hạn chế đặt và gỡ độc lập', () => {
  it('mang cả "máy" lẫn "tài khoản mới", người đăng lên T1: còn "máy", vẫn hạn chế', async () => {
    const owner = await newUser(t0);
    const both = await machinePass(t0, owner, await submitted(t0, owner), true);
    expect(both.restrictions).toEqual(['machine', 'new_account']);
    await prisma.outboxEvent.create({
      data: { type: 'trust.tier.changed', payload: { accountId: owner.id, from: 'T0', to: 'T1' } },
    });
    await deliverAll(app);
    expect((await getOwn(app, owner, both.id)).restrictions).toEqual(['machine']);
  });

  it('lý do "máy" không tự gỡ theo thời gian: 10 ngày sau vẫn hạn chế', async () => {
    const owner = await newUser(app);
    const limited = await machinePass(app, owner, await submitted(app, owner), true);
    now = new Date(TEST_NOW.getTime() + 10 * DAY_MS);
    await app.modules.listing.expireDue();
    await app.modules.listing.remindExpiring();
    expect((await getOwn(app, await signedInAt(app, owner, now), limited.id)).restrictions).toEqual(
      ['machine'],
    );
  });

  it('T1 sửa tin mang "máy", lượt qua máy sau sửa cho hiện đầy đủ: gỡ "máy", hiển thị đầy đủ', async () => {
    const owner = await newUser(app);
    const limited = await machinePass(app, owner, await submitted(app, owner), true);
    const edited = (await patch(app, owner, limited, { title: 'Đã sửa theo góp ý' })).json().data;
    expect((await machinePass(app, owner, edited)).restrictions).toEqual([]);
  });
});

describe('Lý do "tài khoản mới"', () => {
  it('T0 đăng sàn chung hay "nhóm công khai": mang lý do; "chỉ thành viên": không, hiển thị đầy đủ', async () => {
    const group = await createActiveGroup(t0);
    await groupSettings(t0, group.owner, group.groupId, { allowOutsiders: true });
    const member = await addMember(t0, group.groupId);
    const market = await machinePass(t0, member, await submitted(t0, member));
    const groupPublic = await machinePass(
      t0,
      member,
      await submitted(t0, member, { placement: 'group_public', groupId: group.groupId }),
    );
    const membersOnly = await machinePass(
      t0,
      member,
      await submitted(t0, member, { placement: 'members_only', groupId: group.groupId }),
    );
    expect(market.restrictions).toEqual(['new_account']);
    expect(groupPublic.restrictions).toEqual(['new_account']);
    expect(membersOnly.restrictions).toEqual([]);
  });

  it('T0 thu hẹp tin sàn chung về "chỉ thành viên" nhóm mình: gỡ lý do, đầy đủ trong nhóm', async () => {
    const group = await createActiveGroup(t0);
    const member = await addMember(t0, group.groupId);
    const market = await machinePass(t0, member, await submitted(t0, member));
    const narrowed = await patch(t0, member, market, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    expect(narrowed.json().data).toMatchObject({ state: 'live', restrictions: [] });
    expect(await idsAt(`/groups/${group.groupId}/listings`, member)).toContain(market.id);
  });

  it('ba tin chỉ mang "tài khoản mới", người đăng lên T1: cả ba hiển thị đầy đủ', async () => {
    const owner = await newUser(t0);
    const listings = await Promise.all(
      [1, 2, 3].map(async () => machinePass(t0, owner, await submitted(t0, owner))),
    );
    await prisma.outboxEvent.create({
      data: { type: 'trust.tier.changed', payload: { accountId: owner.id, from: 'T0', to: 'T2' } },
    });
    await deliverAll(app);
    const rows = await prisma.listing.findMany({
      where: { id: { in: listings.map((l) => l.id) } },
    });
    expect(rows.map((row) => row.restrictions)).toEqual([[], [], []]);
  });

  it('tụt về T0: không đặt lại lý do lên tin đang hiện', async () => {
    const owner = await newUser(app);
    const full = await liveListingOf(app, owner);
    await prisma.outboxEvent.create({
      data: { type: 'trust.tier.changed', payload: { accountId: owner.id, from: 'T1', to: 'T0' } },
    });
    await deliverAll(app);
    expect((await getOwn(app, owner, full.id)).restrictions).toEqual([]);
  });
});

describe('Ai thấy một tin', () => {
  it('tin chờ duyệt, bị gỡ: 404 với khách; người đăng thấy tin chờ duyệt của mình', async () => {
    const owner = await newUser(app);
    const pending = await machineHold(app, owner, await submitted(app, owner));
    const live = await liveListingOf(app, owner);
    await app.modules.listing.review({
      listingId: live.id,
      version: live.version,
      arrow: 'remove',
      fault: 'violation',
    });
    expect(await opens(pending.id)).toBe(404);
    expect(await opens(live.id)).toBe(404);
    expect((await getOwn(app, owner, pending.id)).state).toBe('pending');
  });

  it('tin sàn chung hết hạn hay đã bán: 200 qua đường link, không trong tìm kiếm', async () => {
    const owner = await newUser(app);
    const word = uniqueWord();
    const sold = await liveListingOf(app, owner, { title: `Đã bán ${word}` });
    await listingApi(app, 'POST', `/listings/${sold.id}/sold`, owner);
    const expiring = await liveListingOf(app, owner, { title: `Hết hạn ${word}` });
    now = new Date(TEST_NOW.getTime() + 31 * DAY_MS);
    await app.modules.listing.expireDue();
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: expiring.id } })).state).toBe(
      'expired',
    );
    expect([await opens(sold.id), await opens(expiring.id)]).toEqual([200, 200]);
    expect(await idsAt(`/listings?q=${word}`)).toEqual([]);
  });

  it('tin đang hiển thị nhưng tạm ẩn (tài khoản người đăng bị khoá): 404', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await listingApi(app, 'POST', `/ops/accounts/${owner.id}/lock`, master, { reason: 'Thử' });
    await deliverAll(app);
    expect(await opens(live.id)).toBe(404);
  });
});

describe('Phạm vi theo nơi đăng', () => {
  it('"chỉ thành viên": khách và người ngoài 404; thành viên 200 và thấy trên bảng tin nhóm', async () => {
    const group = await createActiveGroup(app);
    const [poster, member, outsider] = [
      await addMember(app, group.groupId),
      await addMember(app, group.groupId),
      await newUser(app),
    ];
    const live = await liveListingOf(app, poster, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    expect([await opens(live.id), await opens(live.id, outsider)]).toEqual([404, 404]);
    expect(await opens(live.id, member)).toBe(200);
    expect(await idsAt(`/groups/${group.groupId}/listings`, member)).toEqual([live.id]);
    expect(await idsAt(`/groups/${group.groupId}/listings`, outsider)).toEqual([]);
  });

  it('"nhóm công khai": khách mở được, có trên bảng tin nhóm, không có trên bảng tin sàn chung', async () => {
    const group = await createActiveGroup(app);
    const member = await addMember(app, group.groupId);
    const word = uniqueWord();
    const live = await liveListingOf(app, member, {
      placement: 'group_public',
      groupId: group.groupId,
      title: `Nhóm công khai ${word}`,
    });
    expect(await opens(live.id)).toBe(200);
    expect(await idsAt(`/groups/${group.groupId}/listings`)).toEqual([live.id]);
    expect(await idsAt(`/listings?categoryId=${live.categoryId}`)).toEqual([]);
    expect(await idsAt(`/listings?q=${word}`)).toEqual([]);
    expect(await idsAt(`/groups/${group.groupId}/listings?q=${word}`)).toEqual([live.id]);
  });
});

describe('Bảng tin chỉ lấy tin đang hiển thị mức đầy đủ', () => {
  it('tin chuyển sang hết hạn hay đã bán thì rời bảng tin sàn chung', async () => {
    const owner = await newUser(app);
    const categoryId = await seedCategory();
    const sold = await liveListingOf(app, owner, { categoryId });
    const expiring = await liveListingOf(app, owner, { categoryId });
    expect(new Set(await idsAt(`/listings?categoryId=${categoryId}`))).toEqual(
      new Set([sold.id, expiring.id]),
    );
    await listingApi(app, 'POST', `/listings/${sold.id}/sold`, owner);
    now = new Date(TEST_NOW.getTime() + 31 * DAY_MS);
    await app.modules.listing.expireDue();
    expect(await idsAt(`/listings?categoryId=${categoryId}`)).toEqual([]);
  });

  it('lọc theo giá và khu vực; tin mới lên đầu, con trỏ không lặp không sót', async () => {
    const owner = await newUser(app);
    const categoryId = await seedCategory();
    const cheap = await liveListingOf(app, owner, { categoryId, price: 100_000 });
    now = new Date(TEST_NOW.getTime() + 1000);
    const mid = await liveListingOf(app, owner, { categoryId, price: 500_000 });
    now = new Date(TEST_NOW.getTime() + 2000);
    const dear = await liveListingOf(app, owner, { categoryId, price: 900_000 });
    const base = `/listings?categoryId=${categoryId}`;
    expect(await idsAt(`${base}&priceMin=200000&priceMax=800000`)).toEqual([mid.id]);
    expect(await idsAt(`${base}&provinceCode=${cheap.provinceCode}`)).toEqual([
      dear.id,
      mid.id,
      cheap.id,
    ]);
    const first = (await listingApi(app, 'GET', `${base}&limit=2`, null)).json().data;
    expect(first.items.map((item: { id: string }) => item.id)).toEqual([dear.id, mid.id]);
    now = new Date(TEST_NOW.getTime() + 3000);
    await liveListingOf(app, owner, { categoryId });
    const next = await idsAt(`${base}&limit=2&cursor=${first.nextCursor as string}`);
    expect(next).toEqual([cheap.id]);
  });

  it('con trỏ không phải do server phát: 400 VALIDATION_ERROR', async () => {
    const res = await listingApi(app, 'GET', '/listings?cursor=khong-phai-con-tro', null);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Hồ sơ công khai liệt kê tin đang bán (delta identity/profile)', () => {
  it('khách thấy cả tin đầy đủ lẫn hạn chế', async () => {
    const owner = await newUser(app);
    const full = await liveListingOf(app, owner);
    const limited = await machinePass(app, owner, await submitted(app, owner), true);
    expect(new Set(await idsAt(`/users/${owner.id}/listings`))).toEqual(
      new Set([full.id, limited.id]),
    );
  });

  it('tin "chỉ thành viên" nhóm X: khách không thấy, thành viên nhóm X thấy', async () => {
    const group = await createActiveGroup(app);
    const [seller, member] = [
      await addMember(app, group.groupId),
      await addMember(app, group.groupId),
    ];
    const live = await liveListingOf(app, seller, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    expect(await idsAt(`/users/${seller.id}/listings`)).toEqual([]);
    expect(await idsAt(`/users/${seller.id}/listings`, member)).toEqual([live.id]);
  });

  it('nháp, tin chờ duyệt, tin tạm ẩn vì nhóm bị khoá, tin đã bán, tin hết hạn: không có trên hồ sơ', async () => {
    const group = await createActiveGroup(app, { master });
    const seller = await addMember(app, group.groupId);
    await createDraft(app, seller, { title: 'Nháp' });
    await machineHold(app, seller, await submitted(app, seller));
    await liveListingOf(app, seller, { placement: 'group_public', groupId: group.groupId });
    const sold = await liveListingOf(app, seller);
    await listingApi(app, 'POST', `/listings/${sold.id}/sold`, seller);
    const expiring = await liveListingOf(app, seller);
    await listingApi(app, 'POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    await deliverAll(app);
    now = new Date(TEST_NOW.getTime() + 31 * DAY_MS);
    await app.modules.listing.expireDue();
    expect(await idsAt(`/users/${seller.id}/listings`)).toEqual([]);
    expect([await opens(sold.id), await opens(expiring.id)]).toEqual([200, 200]);
  });
});

describe('Tin của tôi', () => {
  it('mọi trạng thái kèm lý do; lọc theo trạng thái', async () => {
    const owner = await newUser(app);
    const draft = await createDraft(app, owner);
    const limited = await machinePass(app, owner, await submitted(app, owner), true);
    const all = await listingApi(app, 'GET', '/me/listings', owner);
    expect(all.json().data.items.map((item: { id: string }) => item.id)).toEqual([
      limited.id,
      draft.id,
    ]);
    expect(all.json().data.items[0]).toMatchObject({ restrictions: ['machine'], hideReasons: [] });
    const lives = await listingApi(app, 'GET', '/me/listings?state=live', owner);
    expect(lives.json().data.items.map((item: { id: string }) => item.id)).toEqual([limited.id]);
  });

  it('khách: 401', async () => {
    expect((await listingApi(app, 'GET', '/me/listings', null)).statusCode).toBe(401);
  });
});
