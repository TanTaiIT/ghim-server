import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RULE_CODES, RULE_LABELS } from '../src/modules/screening/screening.rules.js';
import { prisma } from './db-helpers.js';
import { api, newMaster, newUser, type TestUser } from './group-helpers.js';
import { buildTestApp, grantStaff } from './test-app.js';

/*
 * Spec `screening/screening-stats` (change add-screening-stats) qua HTTP. Đồng hồ đặt ở năm 2021: DB của một worker còn
 * lượt máy do file khác để lại quanh năm 2026, nên các tháng đếm ở đây không trùng tháng nào của chúng. Không đặt ở tương
 * lai: phiên ghi lần dùng theo giờ thật, đồng hồ tương lai làm phiên "lâu không dùng".
 */
const NOW = new Date('2021-03-15T05:00:00.000Z');
const [CODE_A, CODE_B] = RULE_CODES as [string, string];
let app: FastifyInstance;
let master: TestUser;

/** Một dòng đã gộp khi hết hạn lưu: lượt giữ dải Cao. */
const stat = (month: string, ruleCode: string, runs: number) =>
  prisma.screeningRunStat.create({
    data: {
      month: new Date(`${month}-01T00:00:00.000Z`),
      ruleVersion: 1,
      configVersion: 1,
      outcome: 'hold',
      cause: 'score',
      band: 'high',
      ruleCode,
      runs,
    },
  });

beforeAll(async () => {
  app = await buildTestApp({ clock: () => NOW });
  await app.ready();
  master = await newMaster(app);
  const owner = await newUser(app);
  const run = (fields: Partial<Prisma.ScreeningRunUncheckedCreateInput>) =>
    prisma.screeningRun.create({
      data: {
        listingId: randomUUID(),
        listingVersion: 1,
        accountId: owner.id,
        trigger: 'submission',
        startedAt: new Date('2021-03-02T00:00:00.000Z'),
        textResult: {},
        imageIds: [],
        decidedAt: new Date('2021-03-02T00:00:05.000Z'),
        outcome: 'pass_full',
        cause: 'score',
        score: 10,
        band: 'low',
        tier: 'T1',
        hits: [],
        configVersion: 1,
        ruleVersion: 1,
        ...fields,
      },
    });
  await Promise.all([
    // Tháng này: hai lượt cho qua dải thấp, một lượt giữ dải cao trúng hai luật; một lượt chưa kết luận không tính.
    run({}),
    run({}),
    run({
      outcome: 'hold',
      band: 'high',
      hits: [{ code: CODE_A }, { code: CODE_B }, { code: CODE_A }],
    }),
    run({ decidedAt: null, outcome: null, cause: null, score: null, band: null, tier: null }),
    // Hai tháng trước: một lượt hạn chế dải vừa.
    run({
      startedAt: new Date('2021-01-20T00:00:00.000Z'),
      decidedAt: new Date('2021-01-20T00:00:05.000Z'),
      outcome: 'pass_limited',
      band: 'medium',
      hits: [{ code: CODE_A }],
    }),
    // Đã gộp khi hết hạn lưu: năm lượt giữ tháng 10/2030; tháng 3/2030 nằm ngoài 12 tháng.
    stat('2020-10', '*', 5),
    stat('2020-10', CODE_A, 5),
    stat('2020-03', '*', 9),
    stat('2020-03', CODE_B, 9),
  ]);
});

afterAll(() => app.close());

const stats = (token: string | undefined, query = '') =>
  api(app, 'GET', `/ops/screening/stats${query}`, token);

describe('số liệu máy theo tháng', () => {
  it('12 tháng, cũ trước: cộng lượt còn chi tiết với số đã gộp; tháng không có lượt là số 0', async () => {
    const res = await stats(master.token);
    expect(res.statusCode, res.body).toBe(200);
    const { months } = res.json().data as { months: { month: string }[] };
    expect(months.map((m) => m.month)).toEqual([
      '2020-04',
      '2020-05',
      '2020-06',
      '2020-07',
      '2020-08',
      '2020-09',
      '2020-10',
      '2020-11',
      '2020-12',
      '2021-01',
      '2021-02',
      '2021-03',
    ]);
    const zero = { passFull: 0, passLimited: 0, hold: 0, low: 0, medium: 0, high: 0 };
    expect(months[11]).toEqual({
      ...zero,
      month: '2021-03',
      runs: 3,
      passFull: 2,
      hold: 1,
      low: 2,
      high: 1,
    });
    expect(months[9]).toEqual({ ...zero, month: '2021-01', runs: 1, passLimited: 1, medium: 1 });
    expect(months[6]).toEqual({ ...zero, month: '2020-10', runs: 5, hold: 5, high: 5 });
    expect(months[5]).toEqual({ ...zero, month: '2020-09', runs: 0 });
  });

  it('luật trúng nhiều nhất: một lượt trúng một mã hai lần vẫn tính một; có tên luật', async () => {
    const res = await stats(master.token);
    const { topRules } = res.json().data as {
      topRules: { code: string; label: string; runs: number }[];
    };
    expect(topRules.slice(0, 2)).toEqual([
      { code: CODE_A, label: RULE_LABELS[CODE_A as keyof typeof RULE_LABELS], runs: 7 },
      { code: CODE_B, label: RULE_LABELS[CODE_B as keyof typeof RULE_LABELS], runs: 1 },
    ]);
  });

  it('months=24 thì gồm cả tháng đã gộp xa hơn', async () => {
    const res = await stats(master.token, '?months=24');
    const { months } = res.json().data as { months: { month: string; runs: number }[] };
    expect(months).toHaveLength(24);
    expect(months.find((m) => m.month === '2020-03')?.runs).toBe(9);
  });

  it('months ngoài 1–24 → 400 VALIDATION_ERROR', async () => {
    const res = await stats(master.token, '?months=25');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('staff → 403 FORBIDDEN; khách → 401 UNAUTHORIZED', async () => {
    const staff = await newUser(app);
    await grantStaff(staff.id, ['support']);
    expect((await stats(staff.token)).statusCode).toBe(403);
    expect((await stats(undefined)).statusCode).toBe(401);
  });
});
