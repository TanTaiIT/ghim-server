import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createStaticRuntimeConfig,
  type RuntimeConfig,
} from '../src/common/config/runtime-config.js';
import { createInterimTrust, interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createUnit,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { machineHold, type OwnListing, submitted } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Số liệu cho master qua HTTP (add-review-queues task 8.1): bảng tồn (spec review/queues), tỉ lệ bị lật (spec
 * review/post-review), tỉ lệ máy quá tay theo luật (delta screening/rule-management). Phép tính có test thuần ở
 * `review-stats.calc.test.ts`; ở đây là số đếm thật từ quyết định và việc.
 */
const HOUR_MS = 3_600_000;
let now = TEST_NOW;
let reviewerSamplePercent = 0;
let app: FastifyInstance;
let master: TestUser;

const baseConfig = createStaticRuntimeConfig();
const config: RuntimeConfig = {
  get: (key) =>
    key === 'postcheck.reviewerPassSamplePercent' ? reviewerSamplePercent : baseConfig.get(key),
  version: () => baseConfig.version(),
};

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    config,
    trust: createInterimTrust('T1'),
    screening: interimScreening,
  });
  await app.ready();
  // Lý do mẫu khởi đầu: `truncateAll` đầu mỗi file xoá cả bảng, `buildTestApp` không chạy bước khởi động.
  await app.modules.review.ensureReasonTemplates();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
  reviewerSamplePercent = 0;
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
const dataOf = <T>(res: Res) => (res.json() as { data: T }).data;
const staffOf = async (categoryIds: string[]): Promise<TestUser> => {
  const user = await newUser(app);
  await grantStaff(user.id, [], categoryIds);
  return user;
};
const taskIdOf = async (listingId: string) =>
  (await prisma.reviewTask.findFirstOrThrow({ where: { listingId, status: 'open' } })).id;

async function heldBy(user: TestUser, fields: Record<string, unknown> = {}): Promise<OwnListing> {
  const held = await machineHold(app, user, await submitted(app, user, fields));
  await deliverAll(app);
  return held;
}

/** Nhận rồi quyết qua bàn vận hành hay app của nhóm — hỏng thì nổ ngay. */
async function decide(
  user: TestUser,
  listingId: string,
  body: object,
  groupId: string | null = null,
): Promise<void> {
  const base = groupId ? `/groups/${groupId}/review/tasks` : '/ops/review/tasks';
  const taskId = await taskIdOf(listingId);
  const claim = await api(app, 'POST', `${base}/${taskId}/claim`, user.token);
  if (claim.statusCode !== 200) throw new Error(`Nhận việc hỏng: ${claim.body}`);
  const res = await api(app, 'POST', `${base}/${taskId}/decision`, user.token, body);
  if (res.statusCode !== 200) throw new Error(`Quyết định hỏng: ${res.body}`);
  await deliverAll(app);
}

const PASS = { outcome: 'pass', machineJudgment: 'machine_right' };
const anyTemplateId = async (): Promise<string> =>
  dataOf<{ id: string }[]>(await api(app, 'GET', '/ops/review/reason-templates', master.token))[0]
    ?.id ?? '';

/** Lượt máy đã giữ tin vì `codes` — nhật ký quyết định chụp mã luật từ đây. */
const heldRun = (listing: OwnListing, codes: string[]) => {
  const run: Prisma.ScreeningRunUncheckedCreateInput = {
    listingId: listing.id,
    listingVersion: listing.version,
    accountId: listing.ownerId,
    trigger: 'submission',
    startedAt: TEST_NOW,
    textResult: {},
    imageIds: [],
    decidedAt: TEST_NOW,
    outcome: 'hold',
    cause: 'score',
    score: 70,
    band: 'high',
    tier: 'T1',
    hits: codes.map((code) => ({ code, weight: 40, mode: 'on', refs: [] })),
    configVersion: 1,
    ruleVersion: 1,
  };
  return prisma.screeningRun.create({ data: run });
};

describe('Quyền xem số liệu', () => {
  it('staff xem số liệu: 403; master: 200', async () => {
    const staff = await staffOf([await seedCategory()]);
    const statuses = await Promise.all(
      ['board', 'reviewers', 'rules'].map(
        async (path) =>
          (await api(app, 'GET', `/ops/review/stats/${path}`, staff.token)).statusCode,
      ),
    );
    expect(statuses).toEqual([403, 403, 403]);
    expect((await api(app, 'GET', '/ops/review/stats/board', master.token)).statusCode).toBe(200);
  });
});

describe('Bảng tồn', () => {
  it('việc ở hàng master được 73 giờ hiện là quá hạn; việc của staff không tính vào hàng master', async () => {
    await prisma.reviewTask.updateMany({
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
    const staffed = await seedCategory();
    await staffOf([staffed]);
    await heldBy(await newUser(app), { categoryId: staffed });
    await heldBy(await newUser(app), { categoryId: await seedCategory() });
    now = new Date(TEST_NOW.getTime() + 73 * HOUR_MS);
    const res = await api(app, 'GET', '/ops/review/stats/board', master.token);
    expect(res.statusCode, res.body).toBe(200);
    expect(dataOf(res)).toEqual({
      open: 2,
      queues: [{ queue: 0, open: 2, overdue: 2 }],
      atMaster: { open: 1, overdue: 1, overdueAfterHours: 72 },
    });
  });
});

describe('Tỉ lệ bị lật theo người duyệt', () => {
  it('2 quyết định "đạt" của staff A đã hậu kiểm, người hậu kiểm gỡ 1 tin: 50%', async () => {
    reviewerSamplePercent = 100;
    const category = await seedCategory();
    const [a, b] = [await staffOf([category]), await staffOf([category])];
    const [kept, removed] = [
      await heldBy(await newUser(app), { categoryId: category }),
      await heldBy(await newUser(app), { categoryId: category }),
    ];
    await decide(a, kept.id, PASS);
    await decide(a, removed.id, PASS);
    reviewerSamplePercent = 0;
    await decide(b, kept.id, { outcome: 'pass' });
    await decide(b, removed.id, { outcome: 'mistake', reasonTemplateId: await anyTemplateId() });
    const rows = dataOf<{ accountId: string }[]>(
      await api(app, 'GET', '/ops/review/stats/reviewers', master.token),
    );
    expect(rows.find((row) => row.accountId === a.id)).toEqual({
      accountId: a.id,
      name: expect.any(String),
      reviewed: 2,
      overturned: 1,
      rate: 50,
    });
    expect(rows.find((row) => row.accountId === b.id)).toBeUndefined();
  });

  it('điều hành viên D cho đạt, người hậu kiểm gỡ khỏi nhóm: cũng là bị lật', async () => {
    reviewerSamplePercent = 100;
    const category = await seedCategory();
    const group = await createActiveGroup(app, { master });
    const unit = await createUnit(app, group, `10A ${randomUUID().slice(0, 4)}`);
    const moderator = async () => {
      const user = await addMember(app, group.groupId, { unitId: unit });
      await appointModerator(app, group, user, unit);
      return user;
    };
    const [d, e] = [await moderator(), await moderator()];
    const held = await heldBy(await addMember(app, group.groupId, { unitId: unit }), {
      placement: 'members_only',
      groupId: group.groupId,
      categoryId: category,
    });
    await decide(d, held.id, PASS, group.groupId);
    reviewerSamplePercent = 0;
    await decide(e, held.id, { outcome: 'detach' }, group.groupId);
    const rows = dataOf<{ accountId: string; rate: number | null }[]>(
      await api(app, 'GET', '/ops/review/stats/reviewers', master.token),
    );
    expect(rows.find((row) => row.accountId === d.id)).toMatchObject({
      reviewed: 1,
      overturned: 1,
      rate: 100,
    });
  });
});

describe('Tỉ lệ máy quá tay theo luật', () => {
  it('luật trúng ở 3 tin có quyết định, 2 được cho đạt: 66.7%; tin còn chờ duyệt không tính', async () => {
    const code = `contact_off_platform_${randomUUID().slice(0, 6)}`;
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const heldWith = async () => {
      const held = await heldBy(await newUser(app), { categoryId: category });
      await heldRun(held, [code]);
      return held;
    };
    const first = await heldWith();
    const second = await heldWith();
    const third = await heldWith();
    await heldWith(); // còn chờ duyệt — không tính
    await decide(staff, first.id, { outcome: 'pass', machineJudgment: 'machine_overreach' });
    await decide(staff, second.id, { outcome: 'pass', machineJudgment: 'machine_right' });
    await decide(staff, third.id, { outcome: 'mistake', reasonTemplateId: await anyTemplateId() });
    const rows = dataOf<{ code: string }[]>(
      await api(app, 'GET', '/ops/review/stats/rules', master.token),
    );
    expect(rows.find((row) => row.code === code)).toEqual({
      code,
      decided: 3,
      passed: 2,
      overreach: 1,
      passRate: 66.7,
    });
  });
});
