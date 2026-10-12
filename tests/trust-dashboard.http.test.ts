import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createStaticRuntimeConfig } from '../src/common/config/runtime-config.js';
import { createTrustService } from '../src/modules/trust/trust.service.js';
import { noBuyerInterest } from '../src/modules/trust/trust.shared.js';
import { prisma } from './db-helpers.js';
import { deliverAll, newUser, seedTier, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import {
  listingApi,
  liveListingOf,
  machineHold,
  signedInAt,
  submitted,
} from './listing-http-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec trust/seller-dashboard qua `GET /me/trust` với `trust` thật. Các ca "tin giữ vì dấu hiệu gian lận" (cụm từ cấm,
 * thiết bị, ảnh trùng, đăng dồn) cần lý do giữ của `add-screening` — ở đây chỉ có câu chung "đang chờ người duyệt"
 * của cổng tạm; câu ba phần và mã tra cứu thêm khi `screening` cấp câu (design mục 9).
 */
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const day = (n: number) => new Date(TEST_NOW.getTime() + (n - 1) * DAY_MS);

let now = TEST_NOW;
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now });
  await app.ready();
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

const board = async (user: TestUser) => {
  const res = await listingApi(app, 'GET', '/me/trust', await signedInAt(app, user, now));
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data;
};
const seedClean = (accountId: string, days: number[]) =>
  Promise.all(
    days.map((n) =>
      repositories.trust.addClean({
        listingId: randomUUID(),
        accountId,
        via: 'shown',
        at: day(n),
      }),
    ),
  );

describe('Chỉ chủ tài khoản xem bảng uy tín của mình', () => {
  it('người dùng đã đăng nhập: 200 với bảng của chính mình; khách: 401', async () => {
    const user = await newUser(app);
    expect((await board(user)).tier).toBe('T0');
    const guest = await listingApi(app, 'GET', '/me/trust', null);
    expect(guest.statusCode).toBe(401);
    expect(guest.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('Mức hiện tại và điều còn thiếu để lên mức', () => {
  it('T0, 3 ngày tuổi, chưa có tin sạch: thiếu 4 ngày tuổi và 1 tin sạch để lên T1', async () => {
    const user = await newUser(app);
    now = day(3);
    expect(await board(user)).toMatchObject({
      tier: 'T0',
      countedClean: 0,
      next: { tier: 'T1', missingDays: 4, missingClean: 1 },
    });
  });

  it('T1, 40 ngày tuổi, 3 tin sạch được tính: thiếu 2 tin sạch để lên T2, không thiếu ngày tuổi', async () => {
    const user = await newUser(app);
    await seedClean(user.id, [9, 16, 23]);
    now = day(40);
    await app.modules.trust.recompute(user.id);
    expect(await board(user)).toMatchObject({
      tier: 'T1',
      countedClean: 3,
      next: { tier: 'T2', missingDays: 0, missingClean: 2 },
    });
  });

  it('T3: mức cao nhất, không có mức kế tiếp', async () => {
    const user = await newUser(app);
    await seedClean(
      user.id,
      Array.from({ length: 20 }, (_, i) => 2 + Math.floor(i / 3) * 7 + (i % 3)),
    );
    now = day(90);
    await app.modules.trust.recompute(user.id);
    expect(await board(user)).toMatchObject({ tier: 'T3', next: null });
  });
});

describe('Hạn mức còn lại', () => {
  it('T1 có 18 tin sống, đã dùng 5 lượt trong giờ: 18 trên 20, 0 lượt, kèm lúc có lượt kế tiếp', async () => {
    const user = await newUser(app);
    await seedTier(user.id, 'T1');
    const categoryId = await seedCategory();
    await Promise.all(
      Array.from({ length: 18 }, () => seedListing(liveListing(user.id, categoryId))),
    );
    const holder = await seedListing({ ownerId: user.id, state: 'draft' });
    await prisma.listingSubmission.createMany({
      data: [50, 40, 30, 20, 10].map((minutes, i) => ({
        listingId: holder.id,
        accountId: user.id,
        kind: 'submit' as const,
        fromVersion: i + 1,
        at: new Date(now.getTime() - minutes * MINUTE_MS),
      })),
    });
    expect((await board(user)).quota).toEqual({
      live: 18,
      liveCap: 20,
      submissionsLeft: 0,
      nextSubmissionAt: new Date(now.getTime() + 10 * MINUTE_MS).toISOString(),
    });
  });
});

describe('Tin đang hiển thị hạn chế và lý do', () => {
  it('T0 có tin sàn chung hạn chế vì tài khoản mới: được liệt kê; lên T1 thì hết lý do, rời danh sách', async () => {
    const user = await newUser(app);
    const live = await liveListingOf(app, user);
    expect((await board(user)).restricted).toEqual([
      { id: live.id, title: live.title, restrictions: ['new_account'] },
    ]);
    await seedClean(user.id, [8]);
    now = day(9);
    await app.modules.trust.recompute(user.id);
    await deliverAll(app);
    expect((await board(user)).restricted).toEqual([]);
  });
});

describe('Tin đang chờ người duyệt', () => {
  it('máy giữ tin cho người: liệt kê với câu "đang chờ người duyệt"; không có tin chờ thì danh sách trống', async () => {
    const [holder, idle] = [await newUser(app), await newUser(app)];
    const pending = await machineHold(app, holder, await submitted(app, holder));
    expect((await board(holder)).pending).toEqual([
      {
        id: pending.id,
        title: pending.title,
        reason: 'Đang chờ người duyệt',
        estimatedWait: null,
        lookupCode: null,
      },
    ]);
    expect((await board(idle)).pending).toEqual([]);
  });
});

describe('Câu cho tin chờ duyệt do screening cấp (cổng HoldExplanation)', () => {
  it('cổng trả câu chung ba phần: bảng hiện đúng câu đó, không thêm gì', async () => {
    const holder = await newUser(app);
    const pending = await machineHold(app, holder, await submitted(app, holder));
    const notice = {
      reason: 'Tin cần kiểm tra an toàn thêm',
      estimatedWait: 'trong 24 giờ',
      lookupCode: 'GH-1234',
    };
    const trust = createTrustService({
      repository: repositories.trust,
      listings: app.modules.listing,
      identity: app.modules.identity,
      buyerInterest: noBuyerInterest,
      holds: { explain: (ids) => Promise.resolve(new Map(ids.map((id) => [id, notice]))) },
      config: createStaticRuntimeConfig(),
      clock: () => now,
    });
    const actor = {
      accountId: holder.id,
      role: 'user' as const,
      sessionId: 's',
      secondFactorAt: null,
      emailVerified: true,
    };
    expect((await trust.dashboard(actor)).pending).toEqual([
      { id: pending.id, title: pending.title, ...notice },
    ]);
  });
});

describe('Swagger', () => {
  it('khai GET /me/trust với bearerAuth, 200 và 401; không có route ghi nào của trust', async () => {
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json() as {
      paths: Record<string, Record<string, { security?: unknown[]; responses: object }>>;
    };
    const op = doc.paths['/api/v1/me/trust'];
    expect(Object.keys(op ?? {})).toEqual(['get']);
    expect(op?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(op?.get?.responses ?? {})).toEqual(['200', '401']);
  });
});
