import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import {
  addMember,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  seedTier,
  type TestUser,
} from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import {
  getOwn,
  groupSettings,
  listingApi,
  liveListingOf,
  machineHold,
  patch,
  readyDraft,
  signedInAt,
  submit,
  submitted,
} from './listing-http-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec trust/quotas qua lượt gửi thật của `listing` với `trust` thật. Tin chiếm chỗ ghi thẳng vào DB làm dữ liệu nền —
 * nhịp gửi T0 chỉ 3 lượt mỗi giờ, nên chỉ lượt đang kiểm đi qua HTTP. Đồng hồ app đẩy theo ngày.
 */
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const day = (n: number) => new Date(TEST_NOW.getTime() + (n - 1) * DAY_MS);

let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now });
  await app.ready();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const codeOf = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
const row = (id: string) => prisma.listing.findUniqueOrThrow({ where: { id } });

/** `count` tin của `owner` ghi thẳng: đang hiển thị trên sàn chung, `overrides` đổi trạng thái / nơi đăng. */
async function seedMany(
  owner: TestUser,
  count: number,
  overrides: Partial<Prisma.ListingUncheckedCreateInput> = {},
) {
  const categoryId = await seedCategory();
  return Promise.all(
    Array.from({ length: count }, () => seedListing(liveListing(owner.id, categoryId, overrides))),
  );
}
const notLive = { firstLiveAt: null, expiresAt: null, shownSince: null };

/** Lượt gửi trong quá khứ, cách `now` bấy nhiêu phút — trên một nháp ghi thẳng cho đủ khoá ngoại. */
async function seedSubmissions(owner: TestUser, minutesAgo: number[]) {
  const holder = await seedListing({ ownerId: owner.id, state: 'draft' });
  await prisma.listingSubmission.createMany({
    data: minutesAgo.map((minutes, i) => ({
      listingId: holder.id,
      accountId: owner.id,
      kind: 'submit' as const,
      fromVersion: i + 1,
      at: new Date(now.getTime() - minutes * MINUTE_MS),
    })),
  });
}

describe('Trần tin sống theo mức', () => {
  it('T0 có 9 tin sống gửi tin mới: được; có 10: 409 LISTING_QUOTA_EXCEEDED, tin vẫn là nháp', async () => {
    const [nine, ten] = [await newUser(app), await newUser(app)];
    await seedMany(nine, 9);
    await seedMany(ten, 10);
    expect((await submit(app, nine, await readyDraft(app, nine))).json().data.state).toBe(
      'checking',
    );
    const draft = await readyDraft(app, ten);
    const res = await submit(app, ten, draft);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('LISTING_QUOTA_EXCEEDED');
    expect((await row(draft.id)).state).toBe('draft');
  });

  it('T1 có 20 tin sống gia hạn sớm một tin còn 5 ngày: được, số tin sống vẫn 20', async () => {
    const user = await newUser(app);
    await seedTier(user.id, 'T1');
    const live = await liveListingOf(app, user);
    await seedMany(user, 19);
    now = day(26);
    const res = await listingApi(
      app,
      'POST',
      `/listings/${live.id}/renew`,
      await signedInAt(app, user, now),
      { version: live.version },
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.state).toBe('checking');
  });

  it('T1 có 20 tin sống gia hạn tin đã hết hạn: 409, tin vẫn hết hạn', async () => {
    const user = await newUser(app);
    await seedTier(user.id, 'T1');
    const live = await liveListingOf(app, user);
    now = day(31);
    await app.modules.listing.expireDue();
    await seedMany(user, 20);
    const later = await signedInAt(app, user, now);
    const expired = await getOwn(app, later, live.id);
    const res = await listingApi(app, 'POST', `/listings/${live.id}/renew`, later, {
      version: expired.version,
    });
    expect(codeOf(res)).toBe('LISTING_QUOTA_EXCEEDED');
    expect((await row(live.id)).state).toBe('expired');
  });

  it('T0 có 10 tin sống gửi lại tin bị từ chối vì sai sót: 409, tin vẫn bị từ chối', async () => {
    const user = await newUser(app);
    const pending = await machineHold(app, user, await submitted(app, user));
    const rejected = await app.modules.listing.review({
      listingId: pending.id,
      version: pending.version,
      arrow: 'reject',
      fault: 'mistake',
    });
    await seedMany(user, 10);
    const res = await patch(app, user, rejected, { title: 'Sửa lại cho đúng' });
    expect(codeOf(res)).toBe('LISTING_QUOTA_EXCEEDED');
    expect((await row(pending.id)).state).toBe('rejected');
  });
});

describe('Tin sống gồm những gì', () => {
  it('đếm chung mọi nơi: 4 tin sàn chung, 3 ở nhóm A, 3 ở nhóm B, gửi vào nhóm C → 409', async () => {
    const [a, b, c] = [
      await createActiveGroup(app),
      await createActiveGroup(app),
      await createActiveGroup(app),
    ];
    const user = await newUser(app);
    await seedMany(user, 4);
    await seedMany(user, 3, { placement: 'members_only', groupId: a.groupId });
    await seedMany(user, 3, { placement: 'members_only', groupId: b.groupId });
    await groupSettings(app, c.owner, c.groupId, { allowOutsiders: true });
    const draft = await readyDraft(app, user, { placement: 'group_public', groupId: c.groupId });
    expect(codeOf(await submit(app, user, draft))).toBe('LISTING_QUOTA_EXCEEDED');
  });

  it('9 tin đang hiển thị và 1 tin chờ duyệt: hết chỗ; 9 đang hiển thị và 3 tin tạm ẩn: còn chỗ', async () => {
    const [withPending, withHidden] = [await newUser(app), await newUser(app)];
    await seedMany(withPending, 9);
    await seedMany(withPending, 1, { state: 'pending', ...notLive });
    await seedMany(withHidden, 9);
    await seedMany(withHidden, 3, { hideReasons: ['group_locked'] });
    expect(codeOf(await submit(app, withPending, await readyDraft(app, withPending)))).toBe(
      'LISTING_QUOTA_EXCEEDED',
    );
    expect((await submit(app, withHidden, await readyDraft(app, withHidden))).statusCode).toBe(200);
  });

  it('9 tin đang hiển thị và 1 tin chờ duyệt trong nhóm đã đóng: còn chỗ (fix-audit-listing, T16)', async () => {
    const group = await createActiveGroup(app, { master });
    const user = await addMember(app, group.groupId);
    await seedMany(user, 9);
    await seedMany(user, 1, {
      state: 'pending',
      ...notLive,
      placement: 'members_only',
      groupId: group.groupId,
      hideReasons: ['group_closed'],
      leftGroupAt: now,
    });
    expect((await submit(app, user, await readyDraft(app, user))).statusCode).toBe(200);
  });

  it('9 đang hiển thị, 5 đã bán, 5 hết hạn, 3 nháp: còn chỗ', async () => {
    const user = await newUser(app);
    await seedMany(user, 9);
    await seedMany(user, 5, { state: 'sold', expiresAt: null, shownSince: null });
    await seedMany(user, 5, { state: 'expired', expiresAt: null, shownSince: null });
    await seedMany(user, 3, { state: 'draft', ...notLive });
    expect((await submit(app, user, await readyDraft(app, user))).statusCode).toBe(200);
  });
});

describe('Nhịp gửi theo mức', () => {
  it('T0 đã có 3 lượt trong giờ gửi tin mới: 429 kèm lúc gửi lại, tin vẫn là nháp', async () => {
    const user = await newUser(app);
    const draft = await readyDraft(app, user);
    await seedSubmissions(user, [50, 20, 5]);
    const res = await submit(app, user, draft);
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toMatchObject({
      code: 'SUBMISSION_RATE_LIMITED',
      details: { retryAt: new Date(now.getTime() + 10 * MINUTE_MS).toISOString() },
    });
    expect((await row(draft.id)).state).toBe('draft');
  });

  it('hết lượt rồi sửa giá tin đang hiển thị: 429, giữ nội dung; bật "có thương lượng": được, không tính lượt', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    await seedSubmissions(user, [10, 5]);
    const before = await row(live.id);
    const edited = await patch(app, user, live, { price: 1 });
    expect(codeOf(edited)).toBe('SUBMISSION_RATE_LIMITED');
    expect(await row(live.id)).toEqual(before);
    const toggled = await patch(app, user, live, { negotiable: true });
    expect(toggled.json().data).toMatchObject({ state: 'live', negotiable: true });
    expect(await prisma.listingSubmission.count({ where: { accountId: user.id } })).toBe(3);
  });

  it('lượt sớm nhất đã qua hơn một giờ: được gửi', async () => {
    const user = await newUser(app);
    await seedSubmissions(user, [61, 30, 10]);
    expect((await submit(app, user, await readyDraft(app, user))).statusCode).toBe(200);
  });

  it('lượt bị từ chối vì hết chỗ không bị đếm: bán một tin rồi gửi lại thì được', async () => {
    const user = await newUser(app);
    const seeded = await seedMany(user, 10);
    await seedSubmissions(user, [30, 20]);
    const draft = await readyDraft(app, user);
    expect(codeOf(await submit(app, user, draft))).toBe('LISTING_QUOTA_EXCEEDED');
    await listingApi(app, 'POST', `/listings/${seeded[0]?.id ?? ''}/sold`, user);
    expect((await submit(app, user, draft)).statusCode).toBe(200);
  });
});

describe('Trần riêng của người ngoài trong một nhóm', () => {
  it('người ngoài có 2 tin sống trong nhóm X: thêm vào X thì 409; lên sàn chung thì được; thành viên thì không chịu trần', async () => {
    const group = await createActiveGroup(app);
    await groupSettings(app, group.owner, group.groupId, { allowOutsiders: true });
    const [outsider, member] = [await newUser(app), await addMember(app, group.groupId)];
    const inX = { placement: 'group_public' as const, groupId: group.groupId };
    await seedMany(outsider, 2, inX);
    await seedMany(member, 2, inX);
    const third = await readyDraft(app, outsider, inX);
    const res = await submit(app, outsider, third);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('OUTSIDER_QUOTA_EXCEEDED');
    expect((await submit(app, outsider, await readyDraft(app, outsider))).statusCode).toBe(200);
    expect((await submit(app, member, await readyDraft(app, member, inX))).statusCode).toBe(200);
  });
});

describe('Vượt trần không gỡ tin đang sống', () => {
  it('T2 có 40 tin sống bị tính lại về T1: cả 40 vẫn hiển thị; gửi mới, gia hạn sớm đều 409', async () => {
    const user = await newUser(app);
    await seedTier(user.id, 'T2');
    const renewable = await liveListingOf(app, user);
    const seeded = await seedMany(user, 39);
    await prisma.trustCleanListing.create({
      data: { listingId: renewable.id, accountId: user.id, via: 'shown', cleanAt: day(8) },
    });
    now = day(26);
    expect(await app.modules.trust.recompute(user.id)).toBe('T1');
    expect(
      await prisma.listing.count({
        where: { ownerId: user.id, state: 'live', hideReasons: { isEmpty: true } },
      }),
    ).toBe(40);
    const later = await signedInAt(app, user, now);
    expect(codeOf(await submit(app, later, await readyDraft(app, later)))).toBe(
      'LISTING_QUOTA_EXCEEDED',
    );
    const before = (await row(renewable.id)).expiresAt;
    const renew = await listingApi(app, 'POST', `/listings/${renewable.id}/renew`, later, {
      version: renewable.version,
    });
    expect(codeOf(renew)).toBe('LISTING_QUOTA_EXCEEDED');
    expect((await row(renewable.id)).expiresAt).toEqual(before);
    await prisma.listing.updateMany({
      where: { id: { in: seeded.slice(0, 21).map((listing) => listing.id) } },
      data: { state: 'sold', expiresAt: null, shownSince: null },
    });
    expect((await submit(app, later, await readyDraft(app, later))).statusCode).toBe(200);
  });

  it('T0 có 10 tin sống và 2 tin tạm ẩn vì nhóm khoá, nhóm mở khoá: cả 12 cùng hiện, gửi mới 409', async () => {
    const group = await createActiveGroup(app, { master });
    const user = await addMember(app, group.groupId);
    await seedMany(user, 10);
    await listingApi(app, 'POST', `/ops/groups/${group.groupId}/lock`, master, { reason: 'Thử' });
    await deliverAll(app);
    await seedMany(user, 2, {
      placement: 'members_only',
      groupId: group.groupId,
      hideReasons: ['group_locked'],
    });
    await listingApi(app, 'POST', `/ops/groups/${group.groupId}/unlock`, master);
    await deliverAll(app);
    expect(
      await prisma.listing.count({
        where: { ownerId: user.id, state: 'live', hideReasons: { isEmpty: true } },
      }),
    ).toBe(12);
    expect(codeOf(await submit(app, user, await readyDraft(app, user)))).toBe(
      'LISTING_QUOTA_EXCEEDED',
    );
  });
});

describe('Hết chỗ thì báo tin nào đang chiếm chỗ', () => {
  it('8 tin đang hiển thị và 2 tin chờ duyệt: liệt kê đủ 10 tin kèm trạng thái và cách giải phóng chỗ', async () => {
    const user = await newUser(app);
    await seedMany(user, 8);
    await seedMany(user, 2, { state: 'pending', ...notLive });
    const res = await submit(app, user, await readyDraft(app, user));
    const details = res.json().error.details as {
      occupying: { id: string; title: string | null; state: string }[];
      howTo: string[];
    };
    expect(details.occupying).toHaveLength(10);
    expect(details.occupying.filter((item) => item.state === 'pending')).toHaveLength(2);
    expect(details.howTo).toEqual(['mark_sold', 'delete', 'withdraw_pending']);
    expect(res.json().error.message).toContain('rút tin chờ duyệt về nháp');
  });
});

describe('Hai lượt gửi song song ở 9/10 tin', () => {
  it('đúng một lượt được, lượt kia 409', async () => {
    const user = await newUser(app);
    await seedMany(user, 9);
    const [a, b] = [await readyDraft(app, user), await readyDraft(app, user)];
    const results = await Promise.all([submit(app, user, a), submit(app, user, b)]);
    expect(results.map((res) => res.statusCode).toSorted()).toEqual([200, 409]);
    expect(await prisma.listing.count({ where: { ownerId: user.id, state: 'checking' } })).toBe(1);
  });
});
