import type { FastifyInstance } from 'fastify';
import type { Prisma, ReviewCloseCause, TrustTier } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createStaticRuntimeConfig,
  type RuntimeConfig,
  type RuntimeConfigKey,
} from '../src/common/config/runtime-config.js';
import { REVIEW_JOBS } from '../src/modules/review/review.jobs.js';
import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { createFakeJobs } from './fakes/jobs.fake.js';
import { prisma } from './db-helpers.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import {
  getOwn,
  liveListingOf,
  machineHold,
  machinePass,
  type OwnListing,
  submitted,
} from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Việc theo lịch của `review` (add-review-queues task 7.1, 7.2): job giả, đồng hồ đẩy tay, gọi thẳng lượt mỗi phút, mỗi
 * giờ, mỗi tuần. Spec review/queues (quá hạn, nhắc master, sắp chạm hạn) và review/post-review (lấy mẫu, mẫu tự huỷ,
 * cảnh báo tuần); hộp thư master qua outbox thật (N40–N42).
 */
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
let now = TEST_NOW;
const overrides: Partial<Record<RuntimeConfigKey, number>> = {};
const baseConfig = createStaticRuntimeConfig();
const config: RuntimeConfig = {
  get: (key) => overrides[key] ?? baseConfig.get(key),
  version: () => baseConfig.version(),
};
const jobs = createFakeJobs();
let app: FastifyInstance;
let master: TestUser;

/** Lấy mẫu tắt hết trừ ca đang kiểm: lượt mỗi giờ của ca khác không sinh việc lạ. */
const NO_SAMPLING: Partial<Record<RuntimeConfigKey, number>> = {
  'postcheck.borderlineSamplePercent': 0,
  'postcheck.newAccountSamplePercent': 0,
  'postcheck.otherSamplePercent': 0,
  'postcheck.reviewerPassSamplePercent': 0,
};

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    config,
    jobs,
    trust: createInterimTrust('T1'),
    screening: interimScreening,
  });
  await app.ready();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
  for (const key of Object.keys(overrides)) delete overrides[key as RuntimeConfigKey];
  Object.assign(overrides, NO_SAMPLING);
});

afterAll(() => app.close());

const review = () => app.modules.review;
const at = (ms: number) => new Date(TEST_NOW.getTime() + ms);
const staffOf = async (categoryIds: string[]): Promise<TestUser> => {
  const user = await newUser(app);
  await grantStaff(user.id, [], categoryIds);
  return user;
};
const taskOf = (listingId: string) =>
  prisma.reviewTask.findFirstOrThrow({ where: { listingId }, orderBy: { id: 'desc' } });
const openTasks = (listingId: string) =>
  prisma.reviewTask.findMany({ where: { listingId, status: 'open' } });
const opsListingIds = async (user: TestUser): Promise<string[]> =>
  (
    (await api(app, 'GET', '/ops/review/tasks', user.token)).json() as {
      data: { items: { listingId: string }[] };
    }
  ).data.items.map((item) => item.listingId);
const opsClaim = (user: TestUser, taskId: string) =>
  api(app, 'POST', `/ops/review/tasks/${taskId}/claim`, user.token);
const unreadOf = (recipientId: string, type: string) =>
  prisma.notification.findMany({ where: { recipientId, type, readAt: null } });

async function heldBy(user: TestUser, fields: Record<string, unknown> = {}): Promise<OwnListing> {
  const held = await machineHold(app, user, await submitted(app, user, fields));
  await deliverAll(app);
  return held;
}

/** Tin đang hiện kèm việc mẫu theo rủi ro (hàng 5, hạn 7 ngày). */
async function sampledLive(user: TestUser, categoryId: string): Promise<OwnListing> {
  const live = await liveListingOf(app, user, { categoryId });
  await deliverAll(app);
  await review().addReason(live.id, { reason: 'sample_risk' });
  return live;
}

/** Lượt máy đã kết luận cho tin — lấy mẫu đọc điểm và mức từ đây. */
const machineRun = (
  listing: OwnListing,
  input: { score: number; tier: TrustTier; outcome: 'pass_full' | 'hold' },
) => {
  const run: Prisma.ScreeningRunUncheckedCreateInput = {
    listingId: listing.id,
    listingVersion: listing.version,
    accountId: listing.ownerId,
    trigger: 'submission',
    startedAt: TEST_NOW,
    textResult: {},
    imageIds: [],
    decidedAt: TEST_NOW,
    outcome: input.outcome,
    cause: input.outcome === 'hold' ? 'gate' : 'score',
    score: input.score,
    band: 'medium',
    tier: input.tier,
    hits: [],
    configVersion: 1,
    ruleVersion: 1,
  };
  return prisma.screeningRun.create({ data: run });
};

/** Hàng chờ chỉ còn việc của ca đang kiểm — đếm "một nửa sắp chạm hạn" và số việc nhắc không lẫn việc của ca khác. */
const closeAllOpenTasks = () =>
  prisma.reviewTask.updateMany({
    where: { status: 'open' },
    data: {
      status: 'cancelled',
      closeCause: 'withdrawn',
      closedAt: now,
      claimedBy: null,
      claimExpiresAt: null,
      claimedVersion: null,
    },
  });

describe('Lịch của job', () => {
  it('mỗi phút, mỗi giờ, thứ Hai 08:00', () => {
    expect(jobs.schedules).toEqual(
      expect.arrayContaining([
        { name: REVIEW_JOBS.everyMinute, cron: '* * * * *' },
        { name: REVIEW_JOBS.everyHour, cron: '0 * * * *' },
        { name: REVIEW_JOBS.weeklyPostcheck, cron: '0 8 * * 1' },
      ]),
    );
  });
});

describe('Quá hạn chỉ chuyển cấp, không bao giờ tự mở tin', () => {
  it('việc hàng 0 quá 24 giờ: sang hàng master, tin vẫn chờ duyệt; staff ban đầu không thấy, nhận bằng mã → 404', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: category });
    expect(await opsListingIds(staff)).toContain(held.id);
    now = at(24 * HOUR_MS + MINUTE_MS);
    await review().everyMinute();
    const task = await taskOf(held.id);
    expect(task).toMatchObject({ status: 'open', escalatedAt: now });
    expect(await opsListingIds(staff)).not.toContain(held.id);
    const claim = await opsClaim(staff, task.id);
    expect(claim.statusCode).toBe(404);
    const detail = await api(app, 'GET', `/ops/review/tasks/${task.id}`, master.token);
    expect(detail.json().data.level).toBe('master');
    expect((await getOwn(app, poster, held.id)).state).toBe('pending');
  });

  it('việc hàng 3 quá 72 giờ: sang hàng master, tin vẫn hiển thị hạn chế với lý do "máy"', async () => {
    const category = await seedCategory();
    await staffOf([category]);
    const poster = await newUser(app);
    const limited = await machinePass(
      app,
      poster,
      await submitted(app, poster, { categoryId: category }),
      true,
    );
    await deliverAll(app);
    now = at(72 * HOUR_MS + MINUTE_MS);
    await review().everyMinute();
    expect((await taskOf(limited.id)).escalatedAt).toEqual(now);
    expect(await getOwn(app, poster, limited.id)).toMatchObject({
      state: 'live',
      restrictions: ['machine'],
    });
  });

  it('việc hàng 5 đã gộp lý do máy giữ, quá hạn: sang hàng master, không bị huỷ, tin vẫn chờ duyệt', async () => {
    const category = await seedCategory();
    await staffOf([category]); // có staff: việc đang ở bậc staff mới "chuyển" master khi quá hạn
    const poster = await newUser(app);
    const live = await sampledLive(poster, category);
    expect(await app.modules.listing.recallByMachine(live.id, live.version)).toBe(true);
    await deliverAll(app);
    expect((await openTasks(live.id))[0]).toMatchObject({
      queue: 0,
      reasons: ['machine_hold', 'sample_risk'],
    });
    now = at(24 * HOUR_MS + MINUTE_MS);
    const result = await review().everyMinute();
    expect(result.expired).toBe(0);
    expect(await taskOf(live.id)).toMatchObject({ status: 'open', escalatedAt: now });
    expect((await getOwn(app, poster, live.id)).state).toBe('pending');
  });

  it('nhận việc quá 10 phút: lượt mỗi phút dọn cột nhận việc', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const held = await heldBy(await newUser(app), { categoryId: category });
    const task = await taskOf(held.id);
    expect((await opsClaim(staff, task.id)).statusCode).toBe(200);
    now = at(11 * MINUTE_MS);
    await review().everyMinute();
    expect(await taskOf(held.id)).toMatchObject({ claimedBy: null, claimExpiresAt: null });
  });
});

describe('Mẫu hậu kiểm quá hạn thì tự huỷ', () => {
  it('việc hàng 5 quá 7 ngày chưa ai quyết: huỷ, đếm "bỏ sót", tin vẫn hiển thị như cũ', async () => {
    const category = await seedCategory();
    const poster = await newUser(app);
    const live = await sampledLive(poster, category);
    now = at(7 * DAY_MS + MINUTE_MS);
    await review().everyMinute();
    expect(await taskOf(live.id)).toMatchObject({ status: 'cancelled', closeCause: 'expired' });
    expect(await getOwn(app, poster, live.id)).toMatchObject({
      state: 'live',
      restrictions: live.restrictions,
      expiresAt: live.expiresAt,
    });
  });

  it('staff đang nhận việc hàng 5 lúc việc tự huỷ, rồi quyết: 409 TASK_CLOSED', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const live = await sampledLive(await newUser(app), category);
    const task = await taskOf(live.id);
    now = at(7 * DAY_MS - 5 * MINUTE_MS);
    expect((await opsClaim(staff, task.id)).statusCode).toBe(200);
    now = at(7 * DAY_MS + MINUTE_MS);
    await review().everyMinute();
    const res = await api(app, 'POST', `/ops/review/tasks/${task.id}/decision`, staff.token, {
      outcome: 'pass',
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('TASK_CLOSED');
  });
});

describe('Lấy mẫu hậu kiểm theo rủi ro', () => {
  beforeEach(async () => {
    await prisma.reviewSampleCandidate.deleteMany();
  });

  it('tin của T2 điểm 50 lên bảng đầy đủ: vào hàng 5 ở lượt lấy mẫu kế tiếp', async () => {
    overrides['postcheck.borderlineSamplePercent'] = 100;
    const live = await liveListingOf(app, await newUser(app));
    await machineRun(live, { score: 50, tier: 'T2', outcome: 'pass_full' });
    await deliverAll(app);
    await review().everyHour();
    expect((await openTasks(live.id))[0]).toMatchObject({ queue: 5, reasons: ['sample_risk'] });
    expect(await prisma.reviewSampleCandidate.count({ where: { listingId: live.id } })).toBe(0);
  });

  it('điểm thấp: T1 theo tỉ lệ của T0–T1, T3 theo tỉ lệ còn lại', async () => {
    const [t1, t3] = [
      await liveListingOf(app, await newUser(app)),
      await liveListingOf(app, await newUser(app)),
    ];
    await machineRun(t1, { score: 10, tier: 'T1', outcome: 'pass_full' });
    await machineRun(t3, { score: 0, tier: 'T3', outcome: 'pass_full' });
    await deliverAll(app);
    overrides['postcheck.newAccountSamplePercent'] = 100;
    await review().everyHour();
    expect(await openTasks(t1.id)).toHaveLength(1);
    expect(await openTasks(t3.id)).toEqual([]);

    const [t1b, t3b] = [
      await liveListingOf(app, await newUser(app)),
      await liveListingOf(app, await newUser(app)),
    ];
    await machineRun(t1b, { score: 10, tier: 'T1', outcome: 'pass_full' });
    await machineRun(t3b, { score: 0, tier: 'T3', outcome: 'pass_full' });
    await deliverAll(app);
    overrides['postcheck.newAccountSamplePercent'] = 0;
    overrides['postcheck.otherSamplePercent'] = 100;
    await review().everyHour();
    expect(await openTasks(t1b.id)).toEqual([]);
    expect(await openTasks(t3b.id)).toHaveLength(1);
  });

  it('tin T1 lên bảng hạn chế và đang có việc hàng 3: không bị lấy mẫu', async () => {
    overrides['postcheck.borderlineSamplePercent'] = 100;
    const poster = await newUser(app);
    const limited = await machinePass(app, poster, await submitted(app, poster), true);
    await machineRun(limited, { score: 50, tier: 'T1', outcome: 'pass_full' });
    await deliverAll(app);
    await review().everyHour();
    expect((await openTasks(limited.id)).map((task) => task.reasons)).toEqual([
      ['machine_restricted'],
    ]);
  });

  it('tin máy giữ được người duyệt cho đạt: xét lấy mẫu theo rủi ro như tin máy cho lên', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const held = await heldBy(await newUser(app), { categoryId: category });
    await machineRun(held, { score: 50, tier: 'T1', outcome: 'hold' });
    const task = await taskOf(held.id);
    await opsClaim(staff, task.id);
    const passed = await api(app, 'POST', `/ops/review/tasks/${task.id}/decision`, staff.token, {
      outcome: 'pass',
      machineJudgment: 'machine_overreach',
    });
    expect(passed.statusCode, passed.body).toBe(200);
    await deliverAll(app);
    overrides['postcheck.borderlineSamplePercent'] = 100;
    await review().everyHour();
    expect((await openTasks(held.id))[0]).toMatchObject({ queue: 5, reasons: ['sample_risk'] });
  });
});

describe('Hàng của master có nhắc hạn', () => {
  it('việc ở hàng master được 73 giờ: master được nhắc, tin vẫn chờ duyệt; nhắc lại sau một ngày, không sớm hơn', async () => {
    await closeAllOpenTasks();
    const poster = await newUser(app);
    const held = await heldBy(poster, { categoryId: await seedCategory() });
    // Danh mục chưa có staff: việc ở hàng master từ lúc sinh — quá hạn 24 giờ không "chuyển" nữa, mốc nhắc không dời.
    now = at(25 * HOUR_MS);
    expect((await review().everyMinute()).escalated).toBe(0);
    expect((await taskOf(held.id)).escalatedAt).toBeNull();
    now = at(73 * HOUR_MS);
    expect((await review().everyHour()).reminded).toBe(1);
    await deliverAll(app);
    const [first] = await unreadOf(master.id, 'review.master.reminder');
    expect(first?.body).toBe('1 việc nằm ở hàng master quá 72 giờ chưa ai xử.');
    expect((await getOwn(app, poster, held.id)).state).toBe('pending');

    now = at(74 * HOUR_MS);
    expect((await review().everyHour()).reminded).toBe(0);
    now = at(97 * HOUR_MS);
    expect((await review().everyHour()).reminded).toBe(1);
    await deliverAll(app);
    const unread = await unreadOf(master.id, 'review.master.reminder');
    expect(unread).toHaveLength(1);
    expect(unread[0]?.sourceEventId).not.toBe(first?.sourceEventId);
    expect((await taskOf(held.id)).remindedAt).toEqual(now);
  });
});

describe('Cảnh báo khi nhiều việc sắp chạm hạn', () => {
  it('một nửa số việc sắp chạm hạn: cảnh báo; hai giờ liền mà master chưa đọc: vẫn một dòng chưa đọc', async () => {
    await closeAllOpenTasks();
    await prisma.notification.deleteMany({ where: { type: 'review.deadline.warning' } });
    const category = await seedCategory();
    await heldBy(await newUser(app), { categoryId: category });
    await sampledLive(await newUser(app), category);
    expect((await review().everyHour()).warned).toBe(true);
    now = at(HOUR_MS);
    expect((await review().everyHour()).warned).toBe(true);
    await deliverAll(app);
    const unread = await unreadOf(master.id, 'review.deadline.warning');
    expect(unread).toHaveLength(1);
    expect(unread[0]?.body).toBe('1 trong 2 việc đang chờ sẽ chạm hạn trong 24 giờ tới.');
  });

  it('chưa tới một nửa: không cảnh báo', async () => {
    await closeAllOpenTasks();
    const category = await seedCategory();
    await heldBy(await newUser(app), { categoryId: category });
    await sampledLive(await newUser(app), category);
    await sampledLive(await newUser(app), category);
    expect((await review().everyHour()).warned).toBe(false);
  });
});

/** Việc hàng 5 đã khép lại lúc `closedAt` — dữ liệu nền cho số liệu tuần, không đi lại cả luồng xử. */
async function closedSamples(
  listingId: string,
  rows: { cause: ReviewCloseCause; closedAt: Date; count: number }[],
): Promise<void> {
  await prisma.reviewTask.createMany({
    data: rows.flatMap(({ cause, closedAt, count }) =>
      Array.from({ length: count }, () => ({
        listingId,
        status: cause === 'decided' ? ('decided' as const) : ('cancelled' as const),
        reasons: ['sample_risk' as const],
        queue: 5,
        dueAt: closedAt,
        closeCause: cause,
        closedAt,
        createdAt: closedAt,
      })),
    ),
  });
}

describe('Báo master khi hậu kiểm làm không xuể', () => {
  it('tuần có 3 việc xử xong, 1 tự huỷ (75%): master nhận cảnh báo; việc huỷ vì lý do khác, việc ngoài tuần không tính', async () => {
    const monday = new Date('2027-03-01T00:00:00+07:00');
    const live = await liveListingOf(app, await newUser(app));
    await closedSamples(live.id, [
      { cause: 'decided', closedAt: new Date(monday.getTime() + DAY_MS), count: 3 },
      { cause: 'expired', closedAt: new Date(monday.getTime() + 2 * DAY_MS), count: 1 },
      { cause: 'edited', closedAt: new Date(monday.getTime() + 3 * DAY_MS), count: 2 },
      { cause: 'decided', closedAt: new Date(monday.getTime() - HOUR_MS), count: 4 },
    ]);
    now = new Date(monday.getTime() + 7 * DAY_MS + 8 * HOUR_MS);
    expect(await review().weeklyPostcheck()).toEqual({ rate: 75, alerted: true });
    await deliverAll(app);
    const [notice] = await unreadOf(master.id, 'review.postcheck.low');
    expect(notice?.body).toBe(
      'Hậu kiểm tuần trước làm xong 75% (3 việc xử xong, 1 việc tự huỷ vì quá hạn) — dưới ngưỡng 80%.',
    );
  });

  it('8 xử xong, 2 tự huỷ, 5 huỷ vì tin bị xoá: 80%, không cảnh báo', async () => {
    const monday = new Date('2027-04-05T00:00:00+07:00');
    const live = await liveListingOf(app, await newUser(app));
    await closedSamples(live.id, [
      { cause: 'decided', closedAt: new Date(monday.getTime() + DAY_MS), count: 8 },
      { cause: 'expired', closedAt: new Date(monday.getTime() + DAY_MS), count: 2 },
      { cause: 'listing_deleted', closedAt: new Date(monday.getTime() + DAY_MS), count: 5 },
    ]);
    now = new Date(monday.getTime() + 7 * DAY_MS + 8 * HOUR_MS);
    expect(await review().weeklyPostcheck()).toEqual({ rate: 80, alerted: false });
  });
});
