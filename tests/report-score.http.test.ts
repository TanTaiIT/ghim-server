import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import type { TrustTier } from '../src/modules/listing/listing.ports.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import { api, newUser, seedTier, type TestUser } from './group-helpers.js';
import { liveListingOf, type OwnListing, submitted } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { tokenFor } from './ops-helpers.js';
import {
  aboutListing,
  decideOps,
  report,
  reported,
  scoreOf,
  setScore,
  tieredTrust,
} from './report-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/* Spec review/reporter-score qua HTTP (add-reports): cộng / trừ theo kết quả, xếp cuối hàng, mất quyền, không phạt. */
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
let now = TEST_NOW;
const tiers = new Map<string, TrustTier>();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: tieredTrust(tiers),
    screening: interimScreening,
  });
  await app.ready();
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

/** Danh mục có một staff, và `count` tin sàn đang hiện trong danh mục đó. */
async function category(count: number) {
  const categoryId = await seedCategory();
  const staff = await newUser(app);
  await grantStaff(staff.id, [], [categoryId]);
  const listings = await Promise.all(
    Array.from({ length: count }, async () =>
      liveListingOf(app, await newUser(app), { categoryId }),
    ),
  );
  return { staff, listings };
}

const queueOrder = async (staff: TestUser): Promise<string[]> =>
  (
    (await api(app, 'GET', '/ops/review/tasks', staff.token)).json() as {
      data: { items: { listingId: string }[] };
    }
  ).data.items.map((item) => item.listingId);

describe('Điểm báo cáo theo kết quả', () => {
  it('báo cáo gộp có 3 người (0 điểm) bị bác: mỗi người −1', async () => {
    const { staff, listings } = await category(1);
    const live = listings[0]!;
    const reporters = [await newUser(app), await newUser(app), await newUser(app)];
    await sequentially(reporters, (reporter) =>
      reported(app, reporter, aboutListing(live.id), 'other'),
    );
    await decideOps(app, staff, aboutListing(live.id), {
      outcome: 'keep',
      report: { verdict: 'dismissed' },
    });
    expect(await Promise.all(reporters.map((reporter) => scoreOf(reporter.id)))).toEqual([
      -1, -1, -1,
    ]);
  });

  it('báo cáo của người đang −2 được xác nhận đúng: còn −1', async () => {
    const { staff, listings } = await category(1);
    const live = listings[0]!;
    const reporter = await newUser(app);
    await setScore(reporter.id, -2);
    await reported(app, reporter, aboutListing(live.id), 'fraud');
    const res = await decideOps(app, staff, aboutListing(live.id), {
      outcome: 'keep',
      report: { verdict: 'upheld' },
    });
    expect(res.statusCode).toBe(200);
    expect(await scoreOf(reporter.id)).toBe(-1);
  });
});

describe('Điểm báo cáo bình thường và xếp hàng', () => {
  it('báo cáo của người −4 tới trước báo cáo của người 0 điểm: hàng chờ xếp người 0 điểm lên trước', async () => {
    const { staff, listings } = await category(2);
    const [first, second] = listings as [OwnListing, OwnListing];
    const low = await newUser(app);
    await setScore(low.id, -4);
    await reported(app, low, aboutListing(first.id), 'other');
    now = new Date(TEST_NOW.getTime() + MINUTE_MS);
    await reported(app, await newUser(app), aboutListing(second.id), 'other');
    expect(await queueOrder(staff)).toEqual([second.id, first.id]);
  });

  it('người đúng −3 điểm: báo cáo xếp như người điểm bình thường (theo hạn)', async () => {
    const { staff, listings } = await category(2);
    const [first, second] = listings as [OwnListing, OwnListing];
    const edge = await newUser(app);
    await setScore(edge.id, -3);
    await reported(app, edge, aboutListing(first.id), 'other');
    now = new Date(TEST_NOW.getTime() + MINUTE_MS);
    await reported(app, await newUser(app), aboutListing(second.id), 'other');
    expect(await queueOrder(staff)).toEqual([first.id, second.id]);
  });
});

describe('Mất quyền báo cáo khi điểm quá thấp', () => {
  it('điểm xuống −7, 10 ngày sau báo cáo: 403 REPORTING_SUSPENDED kèm ngày; qua 30 ngày: 201', async () => {
    const { staff, listings } = await category(1);
    const live = listings[0]!;
    const reporter = await newUser(app);
    await setScore(reporter.id, -6);
    await reported(app, reporter, aboutListing(live.id), 'other');
    await decideOps(app, staff, aboutListing(live.id), {
      outcome: 'keep',
      report: { verdict: 'dismissed' },
    });
    expect(await scoreOf(reporter.id)).toBe(-7);
    const target = await liveListingOf(app, await newUser(app));
    now = new Date(TEST_NOW.getTime() + 10 * DAY_MS);
    const suspended = await report(app, reporter, aboutListing(target.id));
    expect(suspended.statusCode).toBe(403);
    expect(suspended.json()).toMatchObject({
      error: {
        code: 'REPORTING_SUSPENDED',
        details: { reportAgainAt: new Date(TEST_NOW.getTime() + 30 * DAY_MS).toISOString() },
      },
    });
    now = new Date(TEST_NOW.getTime() + 30 * DAY_MS + MINUTE_MS);
    const back = { ...reporter, token: await tokenFor(app, reporter.id, now) };
    const res = await report(app, back, aboutListing(target.id));
    expect(res.statusCode).toBe(201);
  });
});

describe('Điểm báo cáo không phải án phạt', () => {
  it('người T2 có −7 điểm, đang mất quyền báo cáo, gửi tin mới: tin được nhận, vẫn T2', async () => {
    const user = await newUser(app);
    await seedTier(user.id, 'T2');
    tiers.set(user.id, 'T2');
    await setScore(user.id, -7, new Date(TEST_NOW.getTime() + 20 * DAY_MS));
    const sent = await submitted(app, user);
    expect(sent.state).toBe('checking');
    expect(
      (await prisma.trustTierResult.findUniqueOrThrow({ where: { accountId: user.id } })).tier,
    ).toBe('T2');
    expect(await scoreOf(user.id)).toBe(-7);
  });
});
