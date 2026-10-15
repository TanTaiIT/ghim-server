import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { LISTING_JOBS } from '../src/modules/listing/listing.jobs.js';
import { outboxEvents, prisma } from './db-helpers.js';
import type { FakeJobs } from './fakes/jobs.fake.js';
import {
  addMember,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import {
  createCategory,
  groupSettings,
  listingApi,
  liveListingOf,
  machineHold,
  machinePass,
  patch,
  signedInAt,
  submitted,
} from './listing-http-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec `listing/display-period` qua HTTP và bên nghe thật, đồng hồ app đẩy theo ngày: tin lên bảng ngày 1 lúc 09:00
 * giờ Việt Nam (`TEST_NOW`), "hết hạn ngày 31" = 30 ngày hiển thị. Phép tính từng bước đã có unit test
 * (`display-period.calc.test.ts`); ở đây kiểm luồng thật nối đúng phép tính đó. Gồm việc theo lịch (task 6.3).
 */
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const day = (n: number, hours = 0) =>
  new Date(TEST_NOW.getTime() + (n - 1) * DAY_MS + hours * HOUR_MS);

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

/** Đẩy đồng hồ app tới ngày `n` rồi giao hết sự kiện đang chờ — bên nghe chạy đúng lúc chuyện xảy ra. */
const at = async (n: number, hours = 0): Promise<void> => {
  now = day(n, hours);
  await deliverAll(app);
};
/**
 * Gọi API bằng phiên ký đúng lúc đang mô phỏng (phiên dựng sẵn hết hạn sau 30 ngày), rồi giao ngay sự kiện vừa phát:
 * bên nghe phải chạy cùng thời điểm với chuyện xảy ra, không phải ở lần đẩy đồng hồ kế tiếp.
 */
const call = async (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  user: TestUser,
  body?: object,
) => {
  const res = await listingApi(app, method, url, await signedInAt(app, user, now), body);
  await deliverAll(app);
  return res;
};
const row = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } });
/** Ngày hết hạn tính theo số ngày của spec; `null` = đồng hồ đang dừng. */
const expiresOn = async (id: string): Promise<number | null> => {
  const { expiresAt } = await row(id);
  return expiresAt ? (expiresAt.getTime() - TEST_NOW.getTime()) / DAY_MS + 1 : null;
};
const remainingDays = async (id: string): Promise<number | null> => {
  const { clockRemainingMs, expiresAt } = await row(id);
  if (expiresAt) return (expiresAt.getTime() - now.getTime()) / DAY_MS;
  return clockRemainingMs === null ? null : Number(clockRemainingMs) / DAY_MS;
};
const approve = (listing: { id: string; version: number }) =>
  app.modules.listing.review({ listingId: listing.id, version: listing.version, arrow: 'approve' });
const own = async (user: TestUser, id: string) =>
  (await call('GET', `/listings/${id}`, user)).json().data as { id: string; version: number };

/** Tin "chỉ thành viên" của một thành viên, lên bảng ngày 1 — ngày 21 còn đúng 10 ngày. */
async function memberListing(options: { outsider?: boolean } = {}) {
  const group = await createActiveGroup(app, { master });
  if (options.outsider)
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
  const poster = options.outsider ? await newUser(app) : await addMember(app, group.groupId);
  const live = await liveListingOf(app, poster, {
    placement: options.outsider ? 'group_public' : 'members_only',
    groupId: group.groupId,
  });
  return { group, poster, live };
}
const rejoin = (groupId: string, accountId: string) =>
  repositories.group.joinDirect({ groupId, accountId, via: 'approved', unitId: null, at: now });

async function expiredListing(fields: Record<string, unknown> = {}) {
  const owner = await newUser(app);
  const live = await liveListingOf(app, owner, fields);
  await at(31, 1);
  await app.modules.listing.expireDue();
  return { owner, listing: await own(owner, live.id) };
}

const renew = (owner: TestUser, listing: { id: string; version: number }) =>
  call('POST', `/listings/${listing.id}/renew`, owner, { version: listing.version });

const remindersFor = async (listingId: string) =>
  (await outboxEvents()).filter(
    (event) =>
      event.type === 'listing.expiry.reminder' &&
      (event.payload as { listingId?: string }).listingId === listingId,
  );

describe('Ba mươi ngày từ lần lên bảng đầu tiên', () => {
  it('không bị dừng lần nào: hết hạn sau đúng 30 ngày hiển thị', async () => {
    const owner = await newUser(app);
    expect(await expiresOn((await liveListingOf(app, owner)).id)).toBe(31);
  });

  it('gửi ngày 1, máy giữ, người duyệt cho đạt ngày 3: 30 ngày tính từ ngày 3', async () => {
    const owner = await newUser(app);
    const pending = await machineHold(app, owner, await submitted(app, owner));
    await at(3);
    await approve(pending);
    expect(await expiresOn(pending.id)).toBe(33);
  });
});

describe('Sửa không làm mới tin', () => {
  it('sửa tiêu đề ngày 20 rồi máy cho qua: hạn và vị trí giữ nguyên', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(20);
    const edited = (await patch(app, owner, live, { title: 'Sửa ngày 20' })).json().data;
    await machinePass(app, owner, edited);
    expect(await row(live.id)).toMatchObject({ firstLiveAt: TEST_NOW, expiresAt: day(31) });
  });

  it('sửa ngày 20, máy giữ 2 ngày rồi người duyệt cho đạt: hạn như trước khi sửa', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(20);
    const edited = (await patch(app, owner, live, { title: 'Sửa ngày 20' })).json().data;
    const pending = await machineHold(app, owner, edited);
    await at(22);
    await approve(pending);
    expect(await expiresOn(live.id)).toBe(31);
  });
});

describe('Ngày dừng khi tin bị gỡ', () => {
  it('lên bảng ngày 1, gỡ ngày 10, khôi phục ngày 15: còn 21 ngày, hết hạn ngày 36', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(10);
    const removed = await app.modules.listing.review({
      listingId: live.id,
      version: live.version,
      arrow: 'remove',
      fault: 'violation',
    });
    await at(15);
    await app.modules.listing.review({
      listingId: removed.id,
      version: removed.version,
      arrow: 'restore',
    });
    expect(await remainingDays(live.id)).toBe(21);
    expect(await expiresOn(live.id)).toBe(36);
  });
});

describe('Ngày dừng hay trôi khi tin tạm ẩn', () => {
  it('nhóm tạm khoá 5 ngày: hiện lại vẫn còn 10 ngày', async () => {
    const { group, live } = await memberListing();
    await at(21);
    await call('POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    await at(26);
    await call('POST', `/ops/groups/${group.groupId}/unlock`, master);
    await at(26);
    expect(await remainingDays(live.id)).toBe(10);
  });

  it('danh mục tắt 3 ngày: hiện lại vẫn còn 10 ngày', async () => {
    const owner = await newUser(app);
    const categoryId = await createCategory(app, master);
    const live = await liveListingOf(app, owner, { categoryId });
    await at(21);
    await call('POST', `/ops/categories/${categoryId}/disable`, master);
    await at(24);
    await call('POST', `/ops/categories/${categoryId}/enable`, master);
    await at(24);
    expect(await remainingDays(live.id)).toBe(10);
  });

  it('tài khoản người đăng bị khoá 4 ngày: hiện lại còn 6 ngày', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(21);
    await call('POST', `/ops/accounts/${owner.id}/lock`, master, { reason: 'Thử' });
    await at(25);
    expect(await row(live.id)).toMatchObject({ hideReasons: ['account_locked'] });
    await call('POST', `/ops/accounts/${owner.id}/unlock`, master);
    await at(25);
    expect(await row(live.id)).toMatchObject({ state: 'live', hideReasons: [] });
    expect(await remainingDays(live.id)).toBe(6);
  });

  it('còn 3 ngày thì bị khoá 5 ngày: hết hạn trong lúc khoá, hiện lại ở trạng thái hết hạn', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(28);
    await call('POST', `/ops/accounts/${owner.id}/lock`, master, { reason: 'Thử' });
    await at(31, 1);
    await app.modules.listing.expireDue();
    expect((await row(live.id)).state).toBe('expired');
    await at(33);
    await call('POST', `/ops/accounts/${owner.id}/unlock`, master);
    await at(33);
    expect(await row(live.id)).toMatchObject({ state: 'expired', hideReasons: [] });
  });

  it('người đăng tự rời nhóm 4 ngày rồi vào lại: còn 6 ngày', async () => {
    const { group, poster, live } = await memberListing();
    await at(21);
    await call('POST', `/groups/${group.groupId}/leave`, poster);
    await at(25);
    expect((await row(live.id)).hideReasons).toEqual(['left_group']);
    await rejoin(group.groupId, poster.id);
    await at(25);
    expect(await remainingDays(live.id)).toBe(6);
  });

  it('người ngoài bị cấm 5 ngày rồi được gỡ cấm: vẫn còn 10 ngày', async () => {
    const { group, poster, live } = await memberListing({ outsider: true });
    await at(21);
    await call('PUT', `/groups/${group.groupId}/bans/${poster.id}`, group.owner);
    await at(26);
    expect((await row(live.id)).hideReasons).toEqual(['group_banned']);
    await call('DELETE', `/groups/${group.groupId}/bans/${poster.id}`, group.owner);
    await at(26);
    expect(await remainingDays(live.id)).toBe(10);
  });

  it('người đăng bị gỡ khỏi nhóm, 4 ngày sau vào lại: vẫn còn 10 ngày', async () => {
    const { group, poster, live } = await memberListing();
    await at(21);
    await call('DELETE', `/groups/${group.groupId}/members/${poster.id}`, group.owner);
    await at(25);
    await rejoin(group.groupId, poster.id);
    await at(25);
    expect(await remainingDays(live.id)).toBe(10);
  });

  it('thành viên bị cấm 5 ngày, gỡ cấm, 3 ngày sau mới vào lại: vẫn còn 10 ngày', async () => {
    const { group, poster, live } = await memberListing();
    await at(21);
    await call('PUT', `/groups/${group.groupId}/bans/${poster.id}`, group.owner);
    await at(26);
    await call('DELETE', `/groups/${group.groupId}/bans/${poster.id}`, group.owner);
    await at(26);
    expect((await row(live.id)).hideReasons).toEqual(['removed_from_group']);
    await at(29);
    await rejoin(group.groupId, poster.id);
    await at(29);
    expect(await row(live.id)).toMatchObject({ hideReasons: [] });
    expect(await remainingDays(live.id)).toBe(10);
  });
});

describe('Hết ngày trong lúc chờ máy hay người', () => {
  it('còn 2 ngày thì sửa, máy giữ, cho đạt sau 3 ngày: lên bảng, hết hạn ở lượt kế, gia hạn được', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(29);
    const edited = (await patch(app, owner, live, { title: 'Sửa sát hạn' })).json().data;
    const pending = await machineHold(app, owner, edited);
    await at(32);
    expect((await approve(pending)).state).toBe('live');
    await app.modules.listing.expireDue();
    const expired = await own(owner, live.id);
    expect((await row(live.id)).state).toBe('expired');
    const renewed = await call('POST', `/listings/${live.id}/renew`, owner, {
      version: expired.version,
    });
    expect(renewed.json().data.state).toBe('checking');
  });
});

describe('Chuyển sang hết hạn mỗi giờ', () => {
  it('dùng hết 30 ngày: trong vòng một giờ sang hết hạn và rời bảng tin', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    const feed = async () =>
      (await listingApi(app, 'GET', `/listings?categoryId=${live.categoryId}`, null)).json().data
        .items as { id: string }[];
    expect((await feed()).map((item) => item.id)).toEqual([live.id]);
    await at(31, 1);
    expect(await app.modules.listing.expireDue()).toBeGreaterThanOrEqual(1);
    expect((await row(live.id)).state).toBe('expired');
    expect(await feed()).toEqual([]);
  });

  it('đủ 30 ngày lịch nhưng từng bị gỡ 5 ngày: chưa hết hạn', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(5);
    const removed = await app.modules.listing.review({
      listingId: live.id,
      version: live.version,
      arrow: 'remove',
      fault: 'violation',
    });
    await at(10);
    await app.modules.listing.review({
      listingId: removed.id,
      version: removed.version,
      arrow: 'restore',
    });
    await at(31, 1);
    await app.modules.listing.expireDue();
    expect((await row(live.id)).state).toBe('live');
    expect(await expiresOn(live.id)).toBe(36);
  });
});

describe('Khi nào được gia hạn', () => {
  it('gia hạn tin hết hạn kèm hạ giá: đang kiểm với giá mới, một lượt gửi', async () => {
    const { owner, listing } = await expiredListing();
    const before = await prisma.listingSubmission.count({ where: { listingId: listing.id } });
    const res = await call('POST', `/listings/${listing.id}/renew`, owner, {
      version: listing.version,
      price: 900_000,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({
      state: 'checking',
      price: 900_000,
      renewal: 'expired',
    });
    expect(await prisma.listingSubmission.count({ where: { listingId: listing.id } })).toBe(
      before + 1,
    );
  });

  it('còn 12 ngày: 409 RENEWAL_TOO_EARLY kèm ngày được gia hạn, tin không đổi', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(19);
    const before = await row(live.id);
    const res = await call('POST', `/listings/${live.id}/renew`, owner, { version: live.version });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('RENEWAL_TOO_EARLY');
    expect(res.json().error.message).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(await row(live.id)).toEqual(before);
  });

  it('tin hết hạn thuộc danh mục đang tắt: 409 CATEGORY_DISABLED, vẫn hết hạn', async () => {
    const categoryId = await createCategory(app, master);
    const { owner, listing } = await expiredListing({ categoryId });
    await call('POST', `/ops/categories/${categoryId}/disable`, master);
    const res = await call('POST', `/listings/${listing.id}/renew`, owner, {
      version: listing.version,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CATEGORY_DISABLED');
    expect((await row(listing.id)).state).toBe('expired');
  });
});

describe('Gia hạn cộng thêm ngày nhưng không đẩy tin lên đầu', () => {
  it('gia hạn sớm ngày 27, máy cho qua: hết hạn ngày 61, vị trí giữ nguyên', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(27);
    await machinePass(app, owner, (await renew(owner, live)).json().data);
    expect(await expiresOn(live.id)).toBe(61);
    expect((await row(live.id)).firstLiveAt).toEqual(TEST_NOW);
  });

  it('gia hạn sớm ngày 27, máy giữ, cho đạt ngày 28: vẫn ngày 61; gia hạn lần nữa thì 409', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(27);
    const pending = await machineHold(app, owner, (await renew(owner, live)).json().data);
    await at(28);
    const approved = await approve(pending);
    expect(await expiresOn(live.id)).toBe(61);
    const again = await renew(owner, approved);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('RENEWAL_TOO_EARLY');
    expect(await expiresOn(live.id)).toBe(61);
  });

  it('gia hạn tin hết hạn ngày 40, máy giữ, cho đạt ngày 42: 30 ngày từ ngày 42, vị trí giữ nguyên', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(31, 1);
    await app.modules.listing.expireDue();
    await at(40);
    const expired = await own(owner, live.id);
    const later = await signedInAt(app, owner, now);
    const pending = await machineHold(app, later, (await renew(owner, expired)).json().data);
    await at(42);
    await approve(pending);
    expect(await expiresOn(live.id)).toBe(72);
    expect((await row(live.id)).firstLiveAt).toEqual(TEST_NOW);
  });
});

describe('Nhắc tin sắp hết hạn (việc theo lịch)', () => {
  it('còn 7 ngày lúc 9 giờ: đúng một lời nhắc kèm ngày hết hạn, chạy lại không nhắc trùng', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(24);
    await app.modules.listing.remindExpiring();
    await app.modules.listing.remindExpiring();
    const reminders = await remindersFor(live.id);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.payload).toMatchObject({
      ownerId: owner.id,
      expiresAt: day(31).toISOString(),
    });
  });

  it('còn 15 ngày: chưa nhắc', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(16);
    await app.modules.listing.remindExpiring();
    expect(await remindersFor(live.id)).toEqual([]);
  });

  it('gia hạn đổi hạn: được nhắc lại cho hạn mới', async () => {
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(24);
    await app.modules.listing.remindExpiring();
    const renewed = await call('POST', `/listings/${live.id}/renew`, owner, {
      version: live.version,
    });
    await machinePass(app, owner, renewed.json().data);
    await at(54);
    await app.modules.listing.remindExpiring();
    expect((await remindersFor(live.id)).map((event) => event.payload)).toEqual([
      expect.objectContaining({ expiresAt: day(31).toISOString() }),
      expect.objectContaining({ expiresAt: day(61).toISOString() }),
    ]);
  });

  it('đồng hồ đang dừng (nhóm tạm khoá): không nhắc, không hết hạn', async () => {
    const group = await createActiveGroup(app, { master });
    const member = await addMember(app, group.groupId);
    const live = await liveListingOf(app, member, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    await at(20);
    await call('POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    await at(24);
    await app.modules.listing.remindExpiring();
    await at(40);
    await app.modules.listing.expireDue();
    expect(await remindersFor(live.id)).toEqual([]);
    expect((await row(live.id)).state).toBe('live');
  });

  it('hai việc được xếp lịch: hết hạn mỗi giờ, nhắc 9 giờ sáng (múi Việt Nam)', async () => {
    const jobs = app.jobs as FakeJobs;
    expect(jobs.schedules).toEqual(
      expect.arrayContaining([
        { name: LISTING_JOBS.expireDue, cron: '25 * * * *' },
        { name: LISTING_JOBS.remindExpiring, cron: '0 9 * * *' },
      ]),
    );
    const owner = await newUser(app);
    const live = await liveListingOf(app, owner);
    await at(31, 1);
    await jobs.send(LISTING_JOBS.expireDue, {});
    await jobs.runAll();
    expect((await row(live.id)).state).toBe('expired');
  });
});
