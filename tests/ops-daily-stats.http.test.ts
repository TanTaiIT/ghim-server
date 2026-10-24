import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DayStatsDto } from '../src/modules/ops/ops.schema.js';
import { prisma, truncateAll } from './db-helpers.js';
import { newMaster, newUser, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { seedAccount } from './ops-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * Spec `ops/daily-stats` qua HTTP. TEST_NOW = 09:00 giờ Việt Nam ngày 10/10/2026 (02:00Z). File xoá sạch DB của worker
 * trước khi dựng app vì số tài khoản mới đếm cả tài khoản của file khác còn sót.
 */
const TODAY = '2026-10-10';
const YESTERDAY = '2026-10-09';
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  await truncateAll();
  app = await buildTestApp({ clock: () => TEST_NOW });
  await app.ready();
  master = await newMaster(app);
});

afterAll(() => app.close());

const daily = (token: string, query = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/ops/stats/daily${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
const rowsOf = async (query = ''): Promise<DayStatsDto[]> => {
  const res = await daily(master.token, query);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data.days as DayStatsDto[];
};
const row = (rows: DayStatsDto[], day: string): DayStatsDto => {
  const found = rows.find((r) => r.day === day);
  if (!found) throw new Error(`không có dòng ${day}`);
  return found;
};

/** Lượt máy đã kết luận (CHECK `screening_runs_decided_check`: có kết luận thì có `outcome` và `cause`). */
const decidedRun = (
  listing: { id: string; ownerId: string },
  listingVersion: number,
  outcome: 'pass_full' | 'pass_limited' | 'hold',
  at: Date,
): Prisma.ScreeningRunCreateManyInput => ({
  listingId: listing.id,
  listingVersion,
  accountId: listing.ownerId,
  trigger: 'submission',
  startedAt: new Date(at.getTime() - 60_000),
  decidedAt: at,
  outcome,
  cause: 'score',
  textResult: {},
  imageIds: [],
  configVersion: 1,
  ruleVersion: 1,
});

/**
 * Quyết định của người về một tin (CHECK `review_decisions_subject_check`: đúng một đối tượng, tin thì kèm trạng thái
 * sau; `severity_check`: từ chối / gỡ thì có mức).
 */
const listingDecision = (
  actorId: string,
  listingId: string,
  outcome: 'pass' | 'reject' | 'remove' | 'dismiss',
): Prisma.ReviewDecisionCreateManyInput => ({
  listingId,
  actorId,
  actorRole: 'master',
  outcome,
  severity: outcome === 'reject' || outcome === 'remove' ? 'mistake' : null,
  listingStateAfter: outcome === 'reject' ? 'rejected' : outcome === 'remove' ? 'removed' : 'live',
  decidedAt: TEST_NOW,
});

describe('Bảng số theo ngày cho master', () => {
  it('bảy ngày mặc định, hôm nay (giờ Việt Nam) trước; múi giờ ghi rõ', async () => {
    const res = await daily(master.token);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.timeZone).toBe('Asia/Ho_Chi_Minh');
    const rows = res.json().data.days as DayStatsDto[];
    expect(rows.map((r) => r.day)).toEqual([
      '2026-10-10',
      '2026-10-09',
      '2026-10-08',
      '2026-10-07',
      '2026-10-06',
      '2026-10-05',
      '2026-10-04',
    ]);
  });

  it('ranh giới ngày theo giờ Việt Nam: 23:30 hôm qua và 00:10 hôm nay rơi vào hai dòng khác nhau', async () => {
    await seedAccount({}, new Date('2026-10-09T16:30:00Z'));
    await seedAccount({}, new Date('2026-10-09T17:10:00Z'));
    const rows = await rowsOf('?days=2');
    expect(row(rows, YESTERDAY).newAccounts).toBe(1);
    // Master của file này cũng tạo hôm nay.
    expect(row(rows, TODAY).newAccounts).toBe(2);
  });

  it('số của máy và của người trong một ngày; hôm qua đếm riêng; ngày trống toàn 0', async () => {
    const owner = await newUser(app);
    const categoryId = await seedCategory();
    const a = await seedListing(liveListing(owner.id, categoryId, { firstLiveAt: TEST_NOW }));
    const b = await seedListing(
      liveListing(owner.id, categoryId, { firstLiveAt: new Date('2026-10-10T01:00:00Z') }),
    );
    await seedListing(
      liveListing(owner.id, categoryId, { firstLiveAt: new Date('2026-10-09T03:00:00Z') }),
    );
    await prisma.screeningRun.createMany({
      data: [
        decidedRun(a, 1, 'pass_full', TEST_NOW),
        decidedRun(a, 2, 'pass_limited', TEST_NOW),
        decidedRun(a, 3, 'hold', TEST_NOW),
        decidedRun(a, 4, 'pass_full', new Date('2026-10-09T03:00:00Z')),
      ],
    });
    await prisma.reviewDecision.createMany({
      data: [
        listingDecision(master.id, a.id, 'pass'),
        listingDecision(master.id, a.id, 'reject'),
        listingDecision(master.id, b.id, 'remove'),
        // Bác báo cáo về tin và quyết định về người: không phải "đạt hay từ chối một tin".
        listingDecision(master.id, a.id, 'dismiss'),
        {
          accountId: owner.id,
          actorId: master.id,
          actorRole: 'master',
          outcome: 'keep',
          decidedAt: TEST_NOW,
        },
      ],
    });

    const rows = await rowsOf('?days=3');
    expect(row(rows, TODAY)).toMatchObject({
      submissions: 3,
      firstLive: 2,
      machine: { passFull: 1, passLimited: 1, hold: 1 },
      decisions: { passed: 1, rejected: 2 },
    });
    expect(row(rows, YESTERDAY)).toMatchObject({
      submissions: 1,
      firstLive: 1,
      machine: { passFull: 1, passLimited: 0, hold: 0 },
      decisions: { passed: 0, rejected: 0 },
    });
    expect(row(rows, '2026-10-08')).toEqual({
      day: '2026-10-08',
      newAccounts: 0,
      submissions: 0,
      firstLive: 0,
      machine: { passFull: 0, passLimited: 0, hold: 0 },
      decisions: { passed: 0, rejected: 0 },
    });
  });

  it('người thường hay staff: 403 FORBIDDEN', async () => {
    const user = await newUser(app);
    const res = await daily(user.token);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('số ngày ngoài 1–90: 400 VALIDATION_ERROR', async () => {
    const responses = await Promise.all(['?days=0', '?days=91'].map((q) => daily(master.token, q)));
    for (const res of responses) {
      expect(res.statusCode, res.body).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });
});
