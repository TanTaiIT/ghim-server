import type { TrustTier } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { INITIAL_RULES } from '../src/modules/screening/screening.rules.js';
import { prisma } from './db-helpers.js';
import { api, newMaster, newUser, type TestUser } from './group-helpers.js';
import { seedCategory } from './listing-helpers.js';
import {
  codesOf,
  DAY_MS,
  LATER,
  MILLION,
  pastHolds,
  priceStats,
  screened,
  tierPort,
  uniqueHash,
} from './screening-helpers.js';
import { buildTestApp, grantStaff } from './test-app.js';

/*
 * Spec screening/rule-management và phần dải của risk-scoring qua bàn vận hành thật: master đổi luật, lượt gửi kế tiếp
 * chấm theo phiên bản mới. Mỗi ca trả luật về giá trị khởi đầu sau khi chạy, để ca sau chấm theo TK 14.
 */
const ZALO = 'Liên hệ Zalo 0912 345 678';

let app: FastifyInstance;
let master: TestUser;
let staff: TestUser;
let staffCategory: string;
const tiers = new Map<string, TrustTier>();

beforeAll(async () => {
  app = await buildTestApp({ clock: () => LATER, trust: tierPort(tiers) });
  await app.modules.screening.ensureRules();
  master = await newMaster(app);
  staff = await newUser(app);
  staffCategory = await seedCategory();
  await grantStaff(staff.id, ['support'], [staffCategory]);
});

afterEach(async () => {
  await Promise.all(
    INITIAL_RULES.map((rule) =>
      prisma.screeningRule.update({
        where: { code: rule.code },
        data: { weight: rule.weight, mode: rule.mode ?? 'on' },
      }),
    ),
  );
  await prisma.screeningRuleOverride.deleteMany();
  await prisma.screeningCategoryBand.deleteMany();
  // Bảng đã về khởi đầu mà phiên bản hiện hành vẫn là ảnh chụp cũ: ghi một phiên bản mới từ đúng các bảng đó.
  await api(app, 'PATCH', '/ops/screening/rules/new_account', master.token, { weight: 10 });
});

afterAll(() => app.close());

const ops = (method: 'PATCH' | 'PUT' | 'DELETE', url: string, body?: object, user = master) =>
  api(app, method, `/ops/screening${url}`, user.token, body);

const userAt = async (tier: TrustTier): Promise<TestUser> => {
  const user = await newUser(app);
  tiers.set(user.id, tier);
  return user;
};

/** Lượt gửi của một tài khoản T2 mới vào `categoryId` — ca chỉ đổi đúng trường đang kiểm. */
const runIn = async (categoryId: string, fields: Record<string, unknown>) =>
  (await screened(app, await userAt('T2'), { categoryId, ...fields })).run;
const ABNORMAL = { price: 90 * MILLION };

describe('Master chỉnh trọng số và chế độ của luật', () => {
  it('hạ "liên hệ ngoài sàn" từ 20 xuống 10: tin chỉ trúng luật này có điểm 10, mang phiên bản luật mới', async () => {
    const before = (await screened(app, await userAt('T2'), { title: 'Quạt trần' })).run;
    const res = await ops('PATCH', '/rules/off_platform_contact', { weight: 10 });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.rules).toContainEqual(
      expect.objectContaining({ code: 'off_platform_contact', weight: 10, mode: 'on' }),
    );
    const { run } = await screened(app, await userAt('T2'), { description: ZALO });
    expect(run.score).toBe(10);
    expect(run.ruleVersion).toBe(res.json().data.version);
    expect(run.ruleVersion).toBeGreaterThan(before.ruleVersion);
  });

  it('staff đổi trọng số: 403; mã luật không tồn tại: 404; bỏ trống trọng số: 400 — luật không đổi', async () => {
    expect((await ops('PATCH', '/rules/burst', { weight: 5 }, staff)).statusCode).toBe(403);
    const missing = await ops('PATCH', '/rules/khong-co-luat-nay', { weight: 5 });
    expect([missing.statusCode, missing.json().error.code]).toEqual([404, 'NOT_FOUND']);
    const bad = await Promise.all(
      [{}, { weight: null }].map((body) => ops('PATCH', '/rules/burst', body)),
    );
    expect(bad.map((res) => [res.statusCode, res.json().error.code])).toEqual([
      [400, 'VALIDATION_ERROR'],
      [400, 'VALIDATION_ERROR'],
    ]);
    expect(
      await prisma.screeningRule.findUniqueOrThrow({ where: { code: 'burst' } }),
    ).toMatchObject({ weight: 20, mode: 'on' });
  });
});

describe('Luật chạy thử và luật tắt không đổi kết quả', () => {
  it('"bị giữ nhiều" chạy thử: điểm chỉ từ luật khác, T1 hiện đầy đủ, lượt trúng ghi ở chế độ chạy thử', async () => {
    await ops('PATCH', '/rules/held_many', { mode: 'trial' });
    const user = await userAt('T1');
    await pastHolds(user.id, ['score', 'score', 'gate'], new Date(LATER.getTime() - DAY_MS));
    const { run } = await screened(app, user, { description: ZALO });
    expect(run).toMatchObject({ score: 20, outcome: 'pass_full' });
    expect(run.hits).toContainEqual({ code: 'held_many', weight: 15, mode: 'trial' });
  });

  it('tắt "tài khoản mới": tài khoản 1 ngày tuổi không trúng, kết quả không ghi luật này', async () => {
    await ops('PATCH', '/rules/new_account', { mode: 'off' });
    const user = await userAt('T0');
    await prisma.account.update({
      where: { id: user.id },
      data: { createdAt: new Date(LATER.getTime() - DAY_MS) },
    });
    const { run } = await screened(app, user);
    expect(run.hits).toEqual([]);
  });

  it('cổng cứng tắt: 400, giữ chế độ cũ; "ảnh trùng" chạy thử: T2 dùng ảnh của người khác vẫn hiện đầy đủ, ghi lượt chạy thử', async () => {
    const off = await ops('PATCH', '/rules/price_over_cap', { mode: 'off' });
    expect([off.statusCode, off.json().error.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect(
      (await prisma.screeningRule.findUniqueOrThrow({ where: { code: 'price_over_cap' } })).mode,
    ).toBe('on');

    await ops('PATCH', '/rules/duplicate_image', { mode: 'trial' });
    const hash = uniqueHash();
    await screened(app, await userAt('T2'), {}, { hashOf: () => hash });
    const { run } = await screened(app, await userAt('T2'), {}, { hashOf: () => hash });
    expect(run.outcome).toBe('pass_full');
    expect(run.hits).toContainEqual(
      expect.objectContaining({ code: 'duplicate_image', mode: 'trial' }),
    );
  });
});

describe('Chỉnh luật riêng theo danh mục', () => {
  it('"liên hệ ngoài sàn" 30 riêng cho Điện thoại: Điện thoại 30, Quần áo 20; bỏ ghi đè thì về 20', async () => {
    const [phones, clothes] = [await seedCategory(), await seedCategory()];
    const set = await ops('PUT', `/rules/off_platform_contact/categories/${phones}`, {
      weight: 30,
    });
    expect(set.statusCode).toBe(200);
    expect([
      (await runIn(phones, { description: ZALO })).score,
      (await runIn(clothes, { description: ZALO })).score,
    ]).toEqual([30, 20]);

    expect(
      (await ops('DELETE', `/rules/off_platform_contact/categories/${phones}`)).statusCode,
    ).toBe(204);
    expect((await runIn(phones, { description: ZALO })).score).toBe(20);
  });

  it('tắt "giá bất thường" riêng cho Đồ cổ: Đồ cổ không trúng, danh mục khác vẫn xét', async () => {
    const [antiques, other] = [await seedCategory(), await seedCategory()];
    await Promise.all([priceStats(antiques), priceStats(other)]);
    await ops('PUT', `/rules/abnormal_price/categories/${antiques}`, { mode: 'off' });
    expect(codesOf(await runIn(antiques, ABNORMAL))).toEqual([]);
    expect(codesOf(await runIn(other, ABNORMAL))).toEqual(['abnormal_price']);
  });

  it('ghi đè cổng cứng thành tắt: 400; danh mục không tồn tại: 404', async () => {
    const category = await seedCategory();
    const off = await ops('PUT', `/rules/price_over_cap/categories/${category}`, { mode: 'off' });
    expect(off.statusCode).toBe(400);
    const missing = await ops(
      'PUT',
      '/rules/burst/categories/00000000-0000-7000-8000-000000000000',
      { weight: 5 },
    );
    expect(missing.statusCode).toBe(404);
  });
});

describe('Ngưỡng dải theo danh mục', () => {
  it('Điện thoại ngưỡng Vừa từ 20: tin điểm 25 ở dải Vừa; danh mục dùng ngưỡng chung vẫn Thấp', async () => {
    const [phones, clothes] = [await seedCategory(), await seedCategory()];
    await Promise.all([priceStats(phones), priceStats(clothes)]);
    const res = await ops('PUT', `/bands/${phones}`, { mediumFrom: 20, highFrom: 60 });
    expect(res.statusCode).toBe(200);
    expect([(await runIn(phones, ABNORMAL)).band, (await runIn(clothes, ABNORMAL)).band]).toEqual([
      'medium',
      'low',
    ]);
  });

  it('ngưỡng Vừa cao hơn ngưỡng Cao: 400, ngưỡng không đổi; staff đổi ngưỡng danh mục mình được giao: 403', async () => {
    const bad = await ops('PUT', `/bands/${staffCategory}`, { mediumFrom: 70, highFrom: 60 });
    expect([bad.statusCode, bad.json().error.code]).toEqual([400, 'VALIDATION_ERROR']);
    const byStaff = await ops(
      'PUT',
      `/bands/${staffCategory}`,
      { mediumFrom: 20, highFrom: 60 },
      staff,
    );
    expect([byStaff.statusCode, byStaff.json().error.code]).toEqual([403, 'FORBIDDEN']);
    expect(await prisma.screeningCategoryBand.count()).toBe(0);
  });
});

describe('Từ khoá danh mục', () => {
  it('staff của danh mục thay được từ khoá; staff danh mục khác và người dùng thường: 403', async () => {
    const own = await ops(
      'PUT',
      `/categories/${staffCategory}/keywords`,
      { keywords: ['Đèn bàn', 'den ban'] },
      staff,
    );
    expect(own.statusCode).toBe(200);
    expect(own.json().data.keywords).toEqual(['DEN BAN']);
    const other = await ops(
      'PUT',
      `/categories/${await seedCategory()}/keywords`,
      { keywords: ['x y'] },
      staff,
    );
    expect(other.statusCode).toBe(403);
    const user = await newUser(app);
    expect(
      (await ops('PUT', `/categories/${staffCategory}/keywords`, { keywords: ['x y'] }, user))
        .statusCode,
    ).toBe(403);
  });
});

describe('Swagger', () => {
  it('khai mọi route bàn vận hành của máy duyệt với bearerAuth và 403', async () => {
    const doc = (await app.inject({ method: 'GET', url: '/docs/json' })).json() as {
      paths: Record<string, Record<string, { security?: unknown[]; responses: object }>>;
    };
    const routes = Object.entries(doc.paths).filter(([path]) =>
      path.startsWith('/api/v1/ops/screening'),
    );
    expect(routes.map(([path]) => path.replace('/api/v1/ops/screening', '')).toSorted()).toEqual([
      '/bands/{categoryId}',
      '/categories/{categoryId}/keywords',
      '/lookups/{code}',
      '/phrases',
      '/phrases/{id}',
      '/phrases/{id}/activate',
      '/phrases/{id}/deactivate',
      '/rules',
      '/rules/{code}',
      '/rules/{code}/categories/{categoryId}',
      '/stats',
      '/whitelist',
      '/whitelist/{id}',
    ]);
    for (const [, operations] of routes) {
      for (const operation of Object.values(operations)) {
        expect(operation.security).toEqual([{ bearerAuth: [] }]);
        expect(operation.responses).toHaveProperty('403');
      }
    }
  });
});
