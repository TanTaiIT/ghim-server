import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createUnit,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  listingApi,
  liveListingOf,
  type OwnListing,
  patch,
  signedInAt,
} from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, grantStaff, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec listing/boosting và delta listing/visibility (change add-admin-boost) qua HTTP: phạm vi theo vai, tin đẩy được,
 * thời gian chờ, nổi bật, nhật ký, hỏi trước quyền đẩy, dải "Tin nổi bật" và vị trí trên bảng tin. Phần thuần ở
 * `boost.calc.test.ts`. Mức T1 để tin lên bảng ở mức đầy đủ.
 */
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: createInterimTrust('T1'),
    screening: interimScreening,
  });
  await app.ready();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
type BoostState = {
  role: string;
  blocked: string | null;
  bumpRetryAt: string | null;
  featuredUntil: string | null;
  featuredMaxDays: number;
};
const dataOf = <T>(res: Res) => (res.json() as { data: T }).data;
const errorOf = (res: Res) =>
  (res.json() as { error: { code: string; message: string; details?: { retryAt?: string } } })
    .error;

/** Token còn hạn ở mốc `now` — đồng hồ của test chạy xa hơn hạn token. */
const fresh = (user: TestUser) => signedInAt(app, user, now);
const bump = async (user: TestUser, id: string) =>
  api(app, 'POST', `/listings/${id}/boost`, (await fresh(user)).token, { effect: 'rank_to_top' });
const feature = async (user: TestUser, id: string, days: number) =>
  api(app, 'POST', `/listings/${id}/boost`, (await fresh(user)).token, {
    effect: 'featured',
    days,
  });
const unfeature = async (user: TestUser, id: string) =>
  api(app, 'DELETE', `/listings/${id}/featured`, (await fresh(user)).token);
const ask = async (user: TestUser, id: string) =>
  api(app, 'GET', `/listings/${id}/boost`, (await fresh(user)).token);

const row = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } });
const auditOf = (id: string) =>
  prisma.auditLog.findMany({
    where: { targetType: 'listing', targetId: id },
    orderBy: { id: 'asc' },
  });
const feedIds = async (query = '') =>
  dataOf<{ items: { id: string }[] }>(
    await listingApi(app, 'GET', `/listings${query}`, null),
  ).items.map((item) => item.id);
const stripIds = async (path: string, user: TestUser | null = null) =>
  dataOf<{ items: { id: string }[] }>(
    await listingApi(app, 'GET', path, user ? await fresh(user) : null),
  ).items.map((item) => item.id);

const staffOf = async (categoryIds: string[]): Promise<TestUser> => {
  const user = await newUser(app);
  await grantStaff(user.id, [], categoryIds);
  return user;
};

/** Tin sàn chung đang hiển thị đầy đủ của một người đăng mới, trong danh mục cho trước. */
const marketListing = async (categoryId: string, poster?: TestUser): Promise<OwnListing> =>
  liveListingOf(app, poster ?? (await newUser(app)), { categoryId });

const groupListing = (group: ActiveGroup, poster: TestUser, categoryId: string) =>
  liveListingOf(app, poster, { placement: 'members_only', groupId: group.groupId, categoryId });

describe('Phạm vi đẩy tin theo vai', () => {
  it('master đẩy tin trong nhóm: tin đứng đầu bảng tin của nhóm', async () => {
    const category = await seedCategory();
    const group = await createActiveGroup(app, { master });
    const poster = await addMember(app, group.groupId);
    const older = await groupListing(group, poster, category);
    now = new Date(now.getTime() + HOUR_MS);
    await groupListing(group, poster, category);
    now = new Date(now.getTime() + HOUR_MS);

    const res = await bump(master, older.id);
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf<BoostState>(res).role).toBe('master');
    const board = dataOf<{ items: { id: string }[] }>(
      await listingApi(app, 'GET', `/groups/${group.groupId}/listings`, await fresh(poster)),
    ).items;
    expect(board[0]?.id).toBe(older.id);
  });

  it('staff: tin sàn chung của danh mục mình được; danh mục khác, tin trong nhóm, quyền treo → 403', async () => {
    const cars = await seedCategory();
    const phones = await seedCategory();
    const staff = await staffOf([cars]);
    expect((await bump(staff, (await marketListing(cars)).id)).statusCode).toBe(200);

    const phone = await marketListing(phones);
    const other = await bump(staff, phone.id);
    expect(other.statusCode).toBe(403);
    expect(errorOf(other).code).toBe('FORBIDDEN');
    expect((await row(phone.id)).lastBumpedAt).toBeNull();

    const group = await createActiveGroup(app, { master });
    const inGroup = await groupListing(group, await addMember(app, group.groupId), cars);
    expect((await bump(staff, inGroup.id)).statusCode).toBe(403);

    const suspended = await staffOf([cars]);
    await repositories.platform.suspendStaff({ accountId: suspended.id, reason: 'gậy', at: now });
    expect((await bump(suspended, (await marketListing(cars)).id)).statusCode).toBe(403);
  });

  it('điều hành đơn vị: tin đơn vị mình được, đơn vị khác → 403; chủ nhóm đẩy tin của chính mình', async () => {
    const category = await seedCategory();
    const group = await createActiveGroup(app, { master });
    const unitA = await createUnit(app, group, `A ${randomUUID().slice(0, 4)}`);
    const unitB = await createUnit(app, group, `B ${randomUUID().slice(0, 4)}`);
    const modA = await addMember(app, group.groupId, { unitId: unitA });
    await appointModerator(app, group, modA, unitA);
    const inA = await groupListing(
      group,
      await addMember(app, group.groupId, { unitId: unitA }),
      category,
    );
    const inB = await groupListing(
      group,
      await addMember(app, group.groupId, { unitId: unitB }),
      category,
    );

    const res = await bump(modA, inA.id);
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf<BoostState>(res).role).toBe('group_moderator');
    expect((await bump(modA, inB.id)).statusCode).toBe(403);

    const own = await groupListing(group, group.owner, category);
    const byOwner = await bump(group.owner, own.id);
    expect(byOwner.statusCode, byOwner.body).toBe(200);
    expect(dataOf<BoostState>(byOwner).role).toBe('group_owner');
  });

  it('chủ nhóm với tin sàn chung mang huy hiệu nhóm → 403; nhóm bị khoá → 403', async () => {
    const category = await seedCategory();
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const badged = await liveListingOf(app, member, {
      categoryId: category,
      badgeGroupId: group.groupId,
    });
    expect(badged.badgeGroupId).toBe(group.groupId);
    expect((await bump(group.owner, badged.id)).statusCode).toBe(403);

    const inGroup = await groupListing(group, member, category);
    const lock = await api(
      app,
      'POST',
      `/ops/groups/${group.groupId}/lock`,
      (await fresh(master)).token,
      {
        reason: 'Kiểm tra',
      },
    );
    expect(lock.statusCode, lock.body).toBeLessThan(300);
    expect((await bump(group.owner, inGroup.id)).statusCode).toBe(403);
  });

  it('người dùng thường → 403, kể cả tin của mình; tin đã xoá → 404; chưa đăng nhập → 401', async () => {
    const poster = await newUser(app);
    const listing = await marketListing(await seedCategory(), poster);
    expect((await bump(poster, listing.id)).statusCode).toBe(403);
    expect((await bump(await newUser(app), listing.id)).statusCode).toBe(403);
    expect(
      (
        await api(app, 'POST', `/listings/${listing.id}/boost`, undefined, {
          effect: 'rank_to_top',
        })
      ).statusCode,
    ).toBe(401);

    const deleted = await listingApi(app, 'DELETE', `/listings/${listing.id}`, await fresh(poster));
    expect(deleted.statusCode, deleted.body).toBeLessThan(300);
    const res = await bump(master, listing.id);
    expect(res.statusCode).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });
});

describe('Chỉ đẩy tin đang hiển thị đầy đủ', () => {
  it('chờ duyệt, hạn chế, tạm ẩn, đã bán → 409 BOOST_NOT_ALLOWED; tin không đổi', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);

    const pending = await marketListing(category);
    await prisma.listing.update({ where: { id: pending.id }, data: { state: 'pending' } });
    const held = await feature(master, pending.id, 7);
    expect(held.statusCode).toBe(409);
    expect(errorOf(held)).toMatchObject({
      code: 'BOOST_NOT_ALLOWED',
      message: 'Tin đang chờ duyệt',
    });
    expect((await row(pending.id)).state).toBe('pending');

    const limited = await marketListing(category);
    await prisma.listing.update({
      where: { id: limited.id },
      data: { restrictions: ['new_account'] },
    });
    const res = await bump(staff, limited.id);
    expect(res.statusCode).toBe(409);
    expect(errorOf(res).message).toMatch(/hiển thị hạn chế/);
    expect((await row(limited.id)).restrictions).toEqual(['new_account']);

    const hidden = await marketListing(category);
    await prisma.listing.update({ where: { id: hidden.id }, data: { hideReasons: ['reported'] } });
    expect((await bump(master, hidden.id)).statusCode).toBe(409);

    const poster = await newUser(app);
    const sold = await marketListing(category, poster);
    expect(
      (await listingApi(app, 'POST', `/listings/${sold.id}/sold`, await fresh(poster))).statusCode,
    ).toBe(200);
    const soldRes = await bump(master, sold.id);
    expect(soldRes.statusCode).toBe(409);
    expect(errorOf(soldRes).message).toBe('Tin đã bán');
  });

  it('đẩy lên đầu không đổi ngày hết hạn, trạng thái, phiên bản, lần sửa cuối, mốc lên bảng', async () => {
    const listing = await marketListing(await seedCategory());
    const before = await row(listing.id);
    now = new Date(now.getTime() + DAY_MS);
    expect((await bump(master, listing.id)).statusCode).toBe(200);
    const after = await row(listing.id);
    expect(after).toMatchObject({
      state: 'live',
      version: before.version,
      updatedAt: before.updatedAt,
      expiresAt: before.expiresAt,
      firstLiveAt: before.firstLiveAt,
      rankAt: now,
      lastBumpedAt: now,
    });
  });
});

describe('Đẩy lên đầu và thời gian chờ', () => {
  it('tin cũ lên đầu bảng tin sàn chung và danh mục; tin lên bảng sau lượt đẩy đứng trên nó', async () => {
    const category = await seedCategory();
    const a = await marketListing(category);
    now = new Date(now.getTime() + HOUR_MS);
    const b = await marketListing(category);
    now = new Date(now.getTime() + HOUR_MS);
    expect((await feedIds(`?categoryId=${category}`)).slice(0, 2)).toEqual([b.id, a.id]);

    expect((await bump(await staffOf([category]), a.id)).statusCode).toBe(200);
    expect((await feedIds(`?categoryId=${category}`)).slice(0, 2)).toEqual([a.id, b.id]);
    expect((await feedIds()).indexOf(a.id)).toBeLessThan((await feedIds()).indexOf(b.id));

    now = new Date(now.getTime() + HOUR_MS);
    const c = await marketListing(category);
    expect((await feedIds(`?categoryId=${category}`)).slice(0, 3)).toEqual([c.id, a.id, b.id]);
  });

  it('trang kế tiếp mở bằng con trỏ cũ không lặp tin vừa đẩy', async () => {
    const category = await seedCategory();
    const a = await marketListing(category);
    now = new Date(now.getTime() + HOUR_MS);
    const b = await marketListing(category);
    now = new Date(now.getTime() + HOUR_MS);
    const first = dataOf<{ items: { id: string }[]; nextCursor: string | null }>(
      await listingApi(app, 'GET', `/listings?categoryId=${category}&limit=1`, null),
    );
    expect(first.items.map((item) => item.id)).toEqual([b.id]);
    expect((await bump(master, a.id)).statusCode).toBe(200);
    const next = dataOf<{ items: { id: string }[] }>(
      await listingApi(
        app,
        'GET',
        `/listings?categoryId=${category}&limit=1&cursor=${first.nextCursor ?? ''}`,
        null,
      ),
    );
    expect(next.items.map((item) => item.id)).toEqual([]);
  });

  it('người đăng đang sửa: lượt đẩy chen giữa không làm bản sửa vấp phiên bản', async () => {
    const poster = await newUser(app);
    const listing = await marketListing(await seedCategory(), poster);
    expect((await bump(master, listing.id)).statusCode).toBe(200);
    const res = await patch(app, await fresh(poster), listing, { description: 'Thêm phụ kiện' });
    expect(res.statusCode, res.body).toBe(200);
  });

  it('đẩy lại sau 2 giờ → 429 BOOST_COOLDOWN với mốc + 24 giờ, vị trí không đổi; đủ 24 giờ thì được', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const listing = await marketListing(category);
    expect((await bump(staff, listing.id)).statusCode).toBe(200);
    const firstAt = now;

    now = new Date(firstAt.getTime() + 2 * HOUR_MS);
    const early = await bump(master, listing.id);
    expect(early.statusCode).toBe(429);
    expect(errorOf(early)).toMatchObject({
      code: 'BOOST_COOLDOWN',
      details: { retryAt: new Date(firstAt.getTime() + DAY_MS).toISOString() },
    });
    expect((await row(listing.id)).rankAt).toEqual(firstAt);

    now = new Date(firstAt.getTime() + DAY_MS);
    expect((await bump(staff, listing.id)).statusCode).toBe(200);
  });

  it('hai người đẩy cùng lúc: đúng một lượt thành công, lượt kia 429', async () => {
    const category = await seedCategory();
    const listing = await marketListing(category);
    const staff = await staffOf([category]);
    const results = await Promise.all([bump(master, listing.id), bump(staff, listing.id)]);
    expect(results.map((res) => res.statusCode).toSorted()).toEqual([200, 429]);
  });
});

describe('Nổi bật', () => {
  it('nổi bật không vướng thời gian chờ; 7 ngày → featuredUntil = lúc đặt + 7 ngày; rút ngắn còn 1 ngày', async () => {
    const listing = await marketListing(await seedCategory());
    expect((await bump(master, listing.id)).statusCode).toBe(200);
    const res = await feature(master, listing.id, 7);
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf<BoostState>(res).featuredUntil).toBe(
      new Date(now.getTime() + 7 * DAY_MS).toISOString(),
    );

    now = new Date(now.getTime() + DAY_MS);
    const shorter = await feature(master, listing.id, 1);
    expect(dataOf<BoostState>(shorter).featuredUntil).toBe(
      new Date(now.getTime() + DAY_MS).toISOString(),
    );
    expect((await row(listing.id)).rankAt).toEqual(new Date(TEST_NOW));
  });

  it('số ngày 0 hay 31 → 400, hạn nổi bật không đổi', async () => {
    const listing = await marketListing(await seedCategory());
    const tries = await Promise.all([0, 31].map((days) => feature(master, listing.id, days)));
    expect(tries.map((res) => [res.statusCode, errorOf(res).code])).toEqual([
      [400, 'VALIDATION_ERROR'],
      [400, 'VALIDATION_ERROR'],
    ]);
    expect((await row(listing.id)).featuredUntil).toBeNull();
  });

  it('bỏ nổi bật sớm: rời dải; tin chưa từng nổi bật vẫn 200 không đổi gì; tin đang chờ duyệt bỏ được', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const listing = await marketListing(category);
    expect((await feature(staff, listing.id, 5)).statusCode).toBe(200);
    expect(await stripIds(`/listings/featured?categoryId=${category}`)).toContain(listing.id);

    const res = await unfeature(staff, listing.id);
    expect(res.statusCode).toBe(200);
    expect(dataOf<BoostState>(res).featuredUntil).toBeNull();
    expect(await stripIds(`/listings/featured?categoryId=${category}`)).not.toContain(listing.id);

    const never = await marketListing(category);
    const plain = await unfeature(master, never.id);
    expect(plain.statusCode).toBe(200);
    expect(dataOf<BoostState>(plain).featuredUntil).toBeNull();
    expect(await auditOf(never.id)).toEqual([]);

    const held = await marketListing(category);
    expect((await feature(master, held.id, 5)).statusCode).toBe(200);
    await prisma.listing.update({ where: { id: held.id }, data: { state: 'pending' } });
    expect((await unfeature(master, held.id)).statusCode).toBe(200);
    await prisma.listing.update({ where: { id: held.id }, data: { state: 'live' } });
    expect(await stripIds(`/listings/featured?categoryId=${category}`)).not.toContain(held.id);
  });
});

describe('Nhật ký và hỏi trước', () => {
  it('điều hành viên đặt nổi bật 3 ngày: một dòng nhật ký mang vai, số ngày, hạn — không nội dung tin', async () => {
    const category = await seedCategory();
    const group = await createActiveGroup(app, { master });
    const moderator = await addMember(app, group.groupId);
    await appointModerator(app, group, moderator, null);
    const listing = await groupListing(group, await addMember(app, group.groupId), category);
    expect((await feature(moderator, listing.id, 3)).statusCode).toBe(200);

    const [entry, ...rest] = await auditOf(listing.id);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      actorId: moderator.id,
      actorRole: 'user',
      action: 'listing.listing.feature',
      details: {
        role: 'group_moderator',
        days: 3,
        featuredUntil: new Date(now.getTime() + 3 * DAY_MS).toISOString(),
      },
    });
    expect(JSON.stringify(entry?.details)).not.toContain(listing.title ?? '');
  });

  it('lượt bị từ chối vì thời gian chờ không ghi nhật ký', async () => {
    const listing = await marketListing(await seedCategory());
    expect((await bump(master, listing.id)).statusCode).toBe(200);
    now = new Date(now.getTime() + HOUR_MS);
    expect((await bump(master, listing.id)).statusCode).toBe(429);
    expect((await auditOf(listing.id)).map((entry) => entry.action)).toEqual([
      'listing.listing.bump',
    ]);
  });

  it('staff hỏi tin vừa đẩy 3 giờ trước: vai staff, đẩy được, mốc đẩy lại; master hỏi tin hạn chế; người thường → 403', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const listing = await marketListing(category);
    expect((await bump(staff, listing.id)).statusCode).toBe(200);
    const bumpedAt = now;
    now = new Date(now.getTime() + 3 * HOUR_MS);
    expect(dataOf<BoostState>(await ask(staff, listing.id))).toEqual({
      role: 'staff',
      blocked: null,
      bumpRetryAt: new Date(bumpedAt.getTime() + DAY_MS).toISOString(),
      featuredUntil: null,
      featuredMaxDays: 30,
    });

    const limited = await marketListing(category);
    await prisma.listing.update({ where: { id: limited.id }, data: { restrictions: ['machine'] } });
    expect(dataOf<BoostState>(await ask(master, limited.id)).blocked).toMatch(/hiển thị hạn chế/);

    expect((await ask(await newUser(app), listing.id)).statusCode).toBe(403);
  });
});

describe('Dải tin nổi bật và hạn nổi bật', () => {
  it('tin sàn nổi bật: có trong dải sàn chung và dải danh mục của nó, không trong dải danh mục khác', async () => {
    const cars = await seedCategory();
    const phones = await seedCategory();
    const listing = await marketListing(cars);
    expect((await feature(await staffOf([cars]), listing.id, 7)).statusCode).toBe(200);
    expect(await stripIds('/listings/featured')).toContain(listing.id);
    expect(await stripIds(`/listings/featured?categoryId=${cars}`)).toEqual([listing.id]);
    expect(await stripIds(`/listings/featured?categoryId=${phones}`)).toEqual([]);
  });

  it('tin nhóm "chỉ thành viên" nổi bật: thành viên thấy trong dải nhóm; khách, người ngoài không; dải sàn không có', async () => {
    const category = await seedCategory();
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const listing = await groupListing(group, member, category);
    expect((await feature(group.owner, listing.id, 7)).statusCode).toBe(200);

    const path = `/groups/${group.groupId}/listings/featured`;
    expect(await stripIds(path, member)).toEqual([listing.id]);
    expect(await stripIds(path)).toEqual([]);
    expect(await stripIds(path, await newUser(app))).toEqual([]);
    expect(await stripIds('/listings/featured')).not.toContain(listing.id);
  });

  it('nhóm không có tin nổi bật: danh sách rỗng; nhóm không có → 404', async () => {
    const group = await createActiveGroup(app, { master });
    expect(await stripIds(`/groups/${group.groupId}/listings/featured`)).toEqual([]);
    expect(
      (await listingApi(app, 'GET', `/groups/${randomUUID()}/listings/featured`, null)).statusCode,
    ).toBe(404);
  });

  it('hơn 6 tin nổi bật: dải có đúng 6 tin hạn gần nhất, hạn gần hết trước', async () => {
    const category = await seedCategory();
    // Phần tử thứ i nổi bật i + 1 ngày: thứ tự dải đúng bằng thứ tự mảng.
    const ids = await Promise.all(
      Array.from({ length: 8 }, async (_, index) => {
        const listing = await marketListing(category);
        expect((await feature(master, listing.id, index + 1)).statusCode).toBe(200);
        return listing.id;
      }),
    );
    expect(await stripIds(`/listings/featured?categoryId=${category}`)).toEqual(ids.slice(0, 6));
  });

  it('tin nổi bật bị hạn chế thì rời dải, gỡ hạn chế khi hạn còn thì vào lại', async () => {
    const category = await seedCategory();
    const listing = await marketListing(category);
    expect((await feature(master, listing.id, 7)).statusCode).toBe(200);
    const path = `/listings/featured?categoryId=${category}`;
    await prisma.listing.update({ where: { id: listing.id }, data: { restrictions: ['strike'] } });
    expect(await stripIds(path)).toEqual([]);
    await prisma.listing.update({ where: { id: listing.id }, data: { restrictions: [] } });
    expect(await stripIds(path)).toEqual([listing.id]);
  });

  it('hết hạn nổi bật: rời dải không cần thao tác, featuredUntil đọc là null, vẫn ở chỗ cũ trong bảng tin', async () => {
    const category = await seedCategory();
    const poster = await newUser(app);
    const listing = await marketListing(category, poster);
    expect((await feature(master, listing.id, 1)).statusCode).toBe(200);
    now = new Date(now.getTime() + DAY_MS / 2);
    expect(
      dataOf<{ featuredUntil: string | null }>(
        await listingApi(app, 'GET', `/listings/${listing.id}`, null),
      ).featuredUntil,
    ).toBe(new Date(TEST_NOW.getTime() + DAY_MS).toISOString());

    now = new Date(TEST_NOW.getTime() + DAY_MS + 1000);
    expect(await stripIds(`/listings/featured?categoryId=${category}`)).toEqual([]);
    expect(
      dataOf<{ featuredUntil: string | null }>(
        await listingApi(app, 'GET', `/listings/${listing.id}`, null),
      ).featuredUntil,
    ).toBeNull();
    expect(await feedIds(`?categoryId=${category}`)).toEqual([listing.id]);
    const own = await listingApi(app, 'GET', `/listings/${listing.id}`, await fresh(poster));
    expect(dataOf<{ featuredUntil: string | null }>(own).featuredUntil).toBeNull();
  });
});
