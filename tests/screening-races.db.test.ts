import type { TrustTier } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { prisma } from './db-helpers.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { getOwn, listingApi, readyDraft, submit } from './listing-http-helpers.js';
import {
  codesOf,
  DAY_MS,
  deviceOf,
  LATER,
  MILLION,
  pastHolds,
  runOf,
  screened,
  tierPort,
  uniqueHash,
} from './screening-helpers.js';
import { buildTestApp } from './test-app.js';

/*
 * Bảng tranh chấp của design add-screening mục 14 — mỗi dòng hai lượt song song trên Postgres thật — cùng các việc nền
 * chạy hai lần (task 6.2), sự kiện nhận trùng (task 6.1) và bước khởi động chạy hai lần (task 1.4).
 */
const MINUTE_MS = 60_000;

let now = LATER;
let app: FastifyInstance;
let jobs: FakeJobs;
let master: TestUser;
const tiers = new Map<string, TrustTier>();

beforeAll(async () => {
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => now, trust: tierPort(tiers), jobs });
  await app.modules.screening.ensureRules();
  master = await newMaster(app);
});

beforeEach(() => {
  now = LATER;
});

afterAll(() => app.close());

const resultEventsOf = (listingId: string) =>
  prisma.outboxEvent.findMany({
    where: {
      type: 'screening.result.recorded',
      payload: { path: ['listingId'], equals: listingId },
    },
  });

/** Tin gửi xong còn một ảnh `pending` — lượt đang chờ ảnh. */
async function waitingOnImage(fields: Record<string, unknown> = {}) {
  const user = await newUser(app);
  const draft = await readyDraft(app, user, fields);
  const imageId = draft.images[0]?.id ?? '';
  await prisma.imageCheck.create({ data: { imageId, ownerAccountId: user.id, status: 'pending' } });
  await submit(app, user, draft, deviceOf(user));
  await deliverAll(app);
  return { user, draft, imageId };
}

describe('Tranh chấp đồng thời (design mục 14)', () => {
  it('bấm Đăng hai lần: lượt thua quay lui cả lượt chấm, đọc lại và trả cùng tin — một lượt máy duy nhất', async () => {
    const user = await newUser(app);
    const draft = await readyDraft(app, user);
    const results = await Promise.all([
      submit(app, user, draft, deviceOf(user)),
      submit(app, user, draft, deviceOf(user)),
    ]);
    expect(results.map((res) => [res.statusCode, res.json().data.id])).toEqual([
      [200, draft.id],
      [200, draft.id],
    ]);
    expect(await prisma.screeningRun.count({ where: { listingId: draft.id } })).toBe(1);
  });

  it('ảnh cuối về đúng lúc lưới an toàn chạy: đúng một kết luận, một sự kiện kết quả', async () => {
    const { draft, imageId } = await waitingOnImage();
    now = new Date(LATER.getTime() + 6 * MINUTE_MS);
    await Promise.all([
      app.modules.screening.checkImage(imageId),
      app.modules.screening.safetyNet(),
    ]);
    expect(await resultEventsOf(draft.id)).toHaveLength(1);
    expect((await runOf(draft.id)).outcome).toBe('hold');
  });

  it('hai lượt dính cổng cứng song song chạm lượt thứ 3: tài khoản vào thời gian chờ', async () => {
    const capped = await seedCategory({ priceCap: 60_000_000n });
    const user = await newUser(app);
    await pastHolds(user.id, ['gate'], new Date(now.getTime() - MINUTE_MS));
    await Promise.all(
      ['Tủ lạnh', 'Máy giặt'].map((title) =>
        screened(app, user, { categoryId: capped, price: 65 * MILLION, title }),
      ),
    );
    expect(
      await prisma.screeningCooldown.findUnique({ where: { accountId: user.id } }),
    ).not.toBeNull();
  });

  it('master đổi luật giữa lượt: lượt kết luận theo phiên bản đọc lúc chấm chữ', async () => {
    const { draft, imageId } = await waitingOnImage({ description: 'Liên hệ Zalo 0912 345 678' });
    const res = await api(app, 'PATCH', '/ops/screening/rules/off_platform_contact', master.token, {
      weight: 10,
    });
    expect(res.statusCode).toBe(200);
    await prisma.imageCheck.update({
      where: { imageId },
      data: {
        status: 'done',
        dhash: uniqueHash() - (1n << 63n),
        band0: 1,
        band1: 2,
        band2: 3,
        band3: 4,
        band4: 5,
      },
    });
    now = new Date(LATER.getTime() + 6 * MINUTE_MS);
    await app.modules.screening.safetyNet();
    const run = await runOf(draft.id);
    expect(run).toMatchObject({ score: 20, cause: 'score' });
    expect(run.ruleVersion).toBeLessThan(res.json().data.version);
    await api(app, 'PATCH', '/ops/screening/rules/off_platform_contact', master.token, {
      weight: 20,
    });
  });
});

describe('Bên nghe và bước khởi động chạy lại không làm trùng', () => {
  it('sự kiện lượt gửi nhận hai lần: việc kiểm ảnh chỉ xếp một lần', async () => {
    const user = await newUser(app);
    const draft = await readyDraft(app, user, {}, 2);
    jobs.sent.length = 0;
    await submit(app, user, draft, deviceOf(user));
    await deliverAll(app);
    const input = { listingId: draft.id, version: draft.version + 1, ownerId: user.id };
    expect(await app.modules.screening.scheduleChecks(input)).toBe(0);
    expect(jobs.sent.filter((job) => job.name === 'screening.check-image')).toHaveLength(2);
  });

  it('bước khởi động của module chạy hai lần: phiên bản luật không tăng thêm', async () => {
    const screening = app.moduleList.find((module) => module.name === 'screening');
    const before = await prisma.screeningRuleVersion.count();
    expect(await screening?.startup?.()).toBeNull();
    expect(await screening?.startup?.()).toBeNull();
    expect(await prisma.screeningRuleVersion.count()).toBe(before);
  });
});

describe('Việc nền chạy hai lần (đồng hồ cố định)', () => {
  it('khai đúng lịch: lưới an toàn mỗi 5 phút, thống kê giá 02:00', () => {
    expect(jobs.schedules).toEqual(
      expect.arrayContaining([
        { name: 'screening.safety-net', cron: '*/5 * * * *' },
        { name: 'screening.price-stats', cron: '0 2 * * *' },
      ]),
    );
  });

  it('thống kê giá: [P10 ÷ 2, P90 × 2] trên giá khác 0 lên bảng trong 90 ngày; chạy lại ra cùng dòng', async () => {
    const categoryId = await seedCategory();
    const { id: ownerId } = await newUser(app);
    const prices = [0, ...Array.from({ length: 40 }, (_, index) => (index + 1) * MILLION)];
    await Promise.all(
      prices.map((price) =>
        seedListing(liveListing(ownerId, categoryId, { price: BigInt(price), firstLiveAt: now })),
      ),
    );
    await seedListing(
      liveListing(ownerId, categoryId, {
        price: 999n * BigInt(MILLION),
        firstLiveAt: new Date(now.getTime() - 100 * DAY_MS),
      }),
    );
    await app.modules.screening.refreshPriceStats();
    const first = await prisma.categoryPriceStat.findUniqueOrThrow({ where: { categoryId } });
    expect(first).toMatchObject({ low: 2_000_000n, high: 72_000_000n, samples: 40 });
    await app.modules.screening.refreshPriceStats();
    expect(
      await prisma.categoryPriceStat.findUniqueOrThrow({ where: { categoryId } }),
    ).toMatchObject({ low: first.low, high: first.high, samples: 40 });
  });

  it('lưới an toàn, kiểm ảnh, quét lại khi bật cụm: lượt thứ hai không làm gì thêm', async () => {
    const { user, draft, imageId } = await waitingOnImage();
    now = new Date(LATER.getTime() + 6 * MINUTE_MS);
    await app.modules.screening.safetyNet();
    expect((await app.modules.screening.safetyNet()).timedOut).toBe(0);
    await app.modules.screening.checkImage(imageId);
    await app.modules.screening.checkImage(imageId);
    await deliverAll(app);
    expect(await resultEventsOf(draft.id)).toHaveLength(1);
    expect((await getOwn(app, user, draft.id)).state).toBe('pending');

    const owner = await newUser(app);
    const live = (await screened(app, owner, { description: 'Bán vàng giả' })).listing;
    const created = await api(app, 'POST', '/ops/screening/phrases', master.token, {
      text: 'bán vàng giả',
      level: 'certain',
    });
    const id = created.json().data.id as string;
    await api(app, 'POST', `/ops/screening/phrases/${id}/activate`, master.token, {
      reason: 'Thử',
    });
    const recalled: number[] = [];
    await sequentially([1, 2], async () => {
      recalled.push(await app.modules.screening.rescanPhrase(id));
    });
    expect(recalled).toEqual([1, 0]);
    await deliverAll(app);
    expect((await getOwn(app, owner, live.id)).state).toBe('pending');
    expect(codesOf(await runOf(live.id, 'recall'))).toEqual(['certain_phrase']);
    const listings = await listingApi(app, 'GET', `/listings/${live.id}`, owner);
    expect(listings.json().data.machineNotice).toMatchObject({ kind: 'fraud' });
  });
});
