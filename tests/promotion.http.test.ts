import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import {
  type ActiveGroup,
  addMember,
  api,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  seedTier,
  type TestUser,
} from './group-helpers.js';
import { getOwn, groupSettings, listingApi, liveListingOf, patch } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { aboutListing, decideOps, reported } from './report-helpers.js';
import { anyArticle, appeal, decideStrike, staffOf } from './strike-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec promotion/catalog, promotion/purchase và delta listing/visibility (change add-promotions) qua HTTP: bộ khởi đầu,
 * master soạn gói, người đăng xem và mua gói, mọi lý do từ chối, khoá chống lặp, trần ngày, nhóm tắt gói, hoàn Xu khi
 * khiếu nại thắng. Phần thuần ở `purchase.calc.test.ts`, ràng buộc DB ở `promotion.db.test.ts`.
 */
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;
let seq = 0;

beforeAll(async () => {
  app = await buildTestApp({ clock: () => now, screening: interimScreening });
  await app.ready();
  await app.modules.review.ensureReasonTemplates();
  await app.modules.trust.ensureRuleArticles();
  await app.modules.promotion.ensureProducts();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
type Product = {
  code: string;
  price: number;
  purchasable: boolean;
  reason: string | null;
  retryAt: string | null;
};
type Purchase = { id: string; productCode: string; expiresAt: string | null; status: string };
const dataOf = <T>(res: Res) => (res.json() as { data: T }).data;
const errorOf = (res: Res) =>
  (res.json() as { error: { code: string; message: string; details?: { retryAt?: string } } })
    .error;
const key = () => `pk${(seq += 1).toString().padStart(8, '0')}`;

/** Người đăng T1 có Xu — mặc định đủ cho vài gói. */
const buyer = async (xu = 5, tier: 'T0' | 'T1' | 'T2' = 'T1'): Promise<TestUser> => {
  const user = await newUser(app);
  await seedTier(user.id, tier);
  if (xu > 0) {
    const res = await api(app, 'POST', `/ops/wallets/${user.id}/adjust`, master.token, {
      amount: xu,
      reason: 'thử gói',
      idempotencyKey: key(),
    });
    if (res.statusCode !== 200) throw new Error(`cấp Xu hỏng: ${res.body}`);
  }
  return user;
};
const products = async (user: TestUser, listingId: string) =>
  dataOf<{ products: Product[]; running: Purchase | null; balance: number }>(
    await api(app, 'GET', `/listings/${listingId}/promotions`, user.token),
  );
const buy = (user: TestUser, listingId: string, productCode: string, idempotencyKey = key()) =>
  api(app, 'POST', `/listings/${listingId}/promotions`, user.token, {
    productCode,
    idempotencyKey,
  });
const balanceOf = (user: TestUser) => repositories.wallet.balanceOf(user.id);
const feedIds = async (query = '') =>
  dataOf<{ items: { id: string }[] }>(
    await listingApi(app, 'GET', `/listings${query}`, null),
  ).items.map((item) => item.id);
const groupFeedIds = async (group: ActiveGroup, user: TestUser) =>
  dataOf<{ items: { id: string }[] }>(
    await listingApi(app, 'GET', `/groups/${group.groupId}/listings`, user),
  ).items.map((item) => item.id);

describe('Catalog', () => {
  it('bộ khởi đầu chèn một lần: ba gói đúng giá, thời hạn, từ T1; master đổi giá rồi khởi động lại không chèn thêm', async () => {
    const list = dataOf<
      { code: string; price: number; durationDays: number | null; minTier: string }[]
    >(await api(app, 'GET', '/ops/promotions/products', master.token));
    expect(list.map((p) => [p.code, p.price, p.durationDays, p.minTier])).toEqual([
      ['rank_to_top', 1, null, 'T1'],
      ['featured_3d', 2, 3, 'T1'],
      ['featured_7d', 4, 7, 'T1'],
    ]);
    const changed = await api(app, 'PATCH', '/ops/promotions/products/rank_to_top', master.token, {
      price: 2,
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(await app.modules.promotion.ensureProducts()).toEqual({ promotionProducts: 0 });
    expect(
      (await prisma.promotionProduct.findUniqueOrThrow({ where: { code: 'rank_to_top' } })).price,
    ).toBe(2);
    await api(app, 'PATCH', '/ops/promotions/products/rank_to_top', master.token, { price: 1 });
    expect(await prisma.auditLog.count({ where: { action: 'promotion.product.update' } })).toBe(2);
  });

  it('tạo gói nổi bật thiếu thời hạn → 400; đẩy lên đầu có thời hạn → 400; mã trùng → 409; staff → 403', async () => {
    const base = { name: 'Thử', cooldownHours: 24, price: 1, minTier: 'T1', scope: 'both' };
    const missing = await api(app, 'POST', '/ops/promotions/products', master.token, {
      ...base,
      code: 'featured_x',
      effect: 'featured',
    });
    expect(missing.statusCode).toBe(400);
    expect(errorOf(missing).code).toBe('VALIDATION_ERROR');
    expect(
      (
        await api(app, 'POST', '/ops/promotions/products', master.token, {
          ...base,
          code: 'top_x',
          effect: 'rank_to_top',
          durationDays: 2,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await api(app, 'POST', '/ops/promotions/products', master.token, {
          ...base,
          code: 'rank_to_top',
          effect: 'rank_to_top',
        })
      ).statusCode,
    ).toBe(409);
    expect(await prisma.promotionProduct.count()).toBe(3);
    const staff = await staffOf(app, [await seedCategory()]);
    expect((await api(app, 'GET', '/ops/promotions/products', staff.token)).statusCode).toBe(403);
  });

  it('tắt gói đang có người dùng: lượt mua chạy tới hết hạn, gói không còn trong danh sách người đăng', async () => {
    const created = await api(app, 'POST', '/ops/promotions/products', master.token, {
      code: `featured_1d_${seq}`,
      name: 'Nổi bật 1 ngày',
      effect: 'featured',
      durationDays: 1,
      cooldownHours: 0,
      price: 1,
      minTier: 'T1',
      scope: 'marketplace',
    });
    expect(created.statusCode, created.body).toBe(201);
    const code = dataOf<{ code: string }>(created).code;
    const user = await buyer();
    const listing = await liveListingOf(app, user, { categoryId: await seedCategory() });
    expect((await buy(user, listing.id, code)).statusCode).toBe(200);
    const off = await api(app, 'PATCH', `/ops/promotions/products/${code}`, master.token, {
      active: false,
    });
    expect(off.statusCode).toBe(200);
    const { products: visible, running } = await products(user, listing.id);
    expect(visible.map((p) => p.code)).not.toContain(code);
    expect(running?.productCode).toBe(code);
    expect(await getOwn(app, user, listing.id)).toMatchObject({
      featuredUntil: new Date(now.getTime() + DAY_MS).toISOString(),
    });
  });

  it('người đăng thấy gói hợp phạm vi kèm giá; T0 thấy gói với "Cần mức T1", không mua được', async () => {
    const t0 = await buyer(5, 'T0');
    const listing = await liveListingOf(app, t0, { categoryId: await seedCategory() });
    const { products: list, balance } = await products(t0, listing.id);
    expect(balance).toBe(5);
    expect(list.map((p) => [p.code, p.price, p.purchasable, p.reason])).toEqual([
      ['rank_to_top', 1, false, 'Cần mức T1 để dùng gói này'],
      ['featured_3d', 2, false, 'Cần mức T1 để dùng gói này'],
      ['featured_7d', 4, false, 'Cần mức T1 để dùng gói này'],
    ]);
    const res = await buy(t0, listing.id, 'rank_to_top');
    expect(res.statusCode).toBe(409);
    expect(errorOf(res).code).toBe('TRUST_TIER_TOO_LOW');
    expect(await balanceOf(t0)).toBe(5);
  });
});

describe('Mua gói', () => {
  it('5 Xu mua "đẩy lên đầu" 1 Xu: ví còn 4, dòng sổ cái trỏ tới tin và lượt mua, tin đứng đầu bảng tin', async () => {
    const category = await seedCategory();
    const user = await buyer();
    const older = await liveListingOf(app, user, { categoryId: category });
    now = new Date(now.getTime() + HOUR_MS);
    const newer = await liveListingOf(app, user, { categoryId: category });
    now = new Date(now.getTime() + HOUR_MS);
    expect((await feedIds(`?categoryId=${category}`)).slice(0, 2)).toEqual([newer.id, older.id]);

    const res = await buy(user, older.id, 'rank_to_top');
    expect(res.statusCode, res.body).toBe(200);
    const purchase = dataOf<Purchase>(res);
    expect(purchase).toMatchObject({
      productCode: 'rank_to_top',
      expiresAt: null,
      status: 'applied',
    });
    expect(await balanceOf(user)).toBe(4);
    const ledger = await prisma.walletTransaction.findFirst({
      where: { accountId: user.id, type: 'product_purchase' },
    });
    expect(ledger).toMatchObject({
      amount: -1,
      balanceAfter: 4,
      refs: { listingId: older.id, purchaseId: purchase.id, productCode: 'rank_to_top' },
    });
    expect((await feedIds(`?categoryId=${category}`)).slice(0, 2)).toEqual([older.id, newer.id]);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: older.id } })).version).toBe(
      older.version,
    );
  });

  it('gửi lại cùng khoá → 200 cùng lượt, ví trừ một lần; hai lượt cùng khoá song song cũng vậy', async () => {
    const user = await buyer();
    const listing = await liveListingOf(app, user, { categoryId: await seedCategory() });
    const idempotencyKey = key();
    const first = await buy(user, listing.id, 'featured_3d', idempotencyKey);
    const again = await buy(user, listing.id, 'featured_3d', idempotencyKey);
    expect([first.statusCode, again.statusCode]).toEqual([200, 200]);
    expect(dataOf<Purchase>(again).id).toBe(dataOf<Purchase>(first).id);
    expect(await balanceOf(user)).toBe(3);

    const other = await buyer();
    const second = await liveListingOf(app, other, { categoryId: await seedCategory() });
    const raceKey = key();
    const results = await Promise.all([
      buy(other, second.id, 'rank_to_top', raceKey),
      buy(other, second.id, 'rank_to_top', raceKey),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(new Set(results.map((r) => dataOf<Purchase>(r).id)).size).toBe(1);
    expect(await balanceOf(other)).toBe(4);
  });

  it('tin hạn chế / chờ duyệt → 409 LISTING_NOT_PROMOTABLE không trừ Xu; thiếu Xu → 409 INSUFFICIENT_BALANCE tin không đổi', async () => {
    const category = await seedCategory();
    const user = await buyer();
    const limited = await liveListingOf(app, user, { categoryId: category });
    await prisma.listing.update({ where: { id: limited.id }, data: { restrictions: ['machine'] } });
    const res = await buy(user, limited.id, 'rank_to_top');
    expect(res.statusCode).toBe(409);
    expect(errorOf(res)).toMatchObject({ code: 'LISTING_NOT_PROMOTABLE' });
    expect(errorOf(res).message).toMatch(/hiển thị hạn chế/);
    expect(await balanceOf(user)).toBe(5);

    const pending = await liveListingOf(app, user, { categoryId: category });
    await prisma.listing.update({ where: { id: pending.id }, data: { state: 'pending' } });
    const held = await buy(user, pending.id, 'featured_3d');
    expect(held.statusCode).toBe(409);
    expect(errorOf(held).message).toBe('Tin đang chờ duyệt');
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: pending.id } })).state).toBe(
      'pending',
    );

    const poor = await buyer(1);
    const listing = await liveListingOf(app, poor, { categoryId: category });
    const before = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    const broke = await buy(poor, listing.id, 'featured_7d');
    expect(broke.statusCode).toBe(409);
    expect(errorOf(broke).code).toBe('INSUFFICIENT_BALANCE');
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({
      featuredUntil: null,
      rankAt: before.rankAt,
    });
    expect(await prisma.promotionPurchase.count({ where: { accountId: poor.id } })).toBe(0);
    const { products: list } = await products(poor, listing.id);
    expect(list.find((p) => p.code === 'featured_7d')).toMatchObject({
      purchasable: false,
      reason: expect.stringMatching(/không đủ Xu/),
    });
  });

  it('phiên bản tin lệch (người đăng vừa sửa) → 409 CONFLICT, không trừ; sửa xong mua lại được', async () => {
    const user = await buyer();
    const listing = await liveListingOf(app, user, { categoryId: await seedCategory() });
    // Sửa tin qua máy: phiên bản tăng — lượt mua đọc tin trước lúc sửa thì vấp.
    const edited = await patch(app, user, listing, { description: 'Thêm phụ kiện' });
    expect(edited.statusCode, edited.body).toBe(200);
    await deliverAll(app);
    // Tin đang kiểm sau sửa: không hiển thị đầy đủ → chờ máy cho qua đã.
    await app.modules.listing.applyMachineOutcome({
      listingId: listing.id,
      listingVersion: dataOf<{ version: number }>(edited).version,
      outcome: 'pass',
      restrictMachine: false,
    });
    await deliverAll(app);
    const res = await buy(user, listing.id, 'rank_to_top');
    expect(res.statusCode, res.body).toBe(200);
    expect(await balanceOf(user)).toBe(4);
  });

  it('3 điểm gậy → 409 POSTING_LOCKED', async () => {
    const category = await seedCategory();
    const staff = await staffOf(app, [category]);
    const user = await buyer();
    const listing = await liveListingOf(app, user, { categoryId: category });
    // Một gậy nặng (2 điểm) + một gậy thường (1 điểm) qua báo cáo về hai tin khác.
    /* oxlint-disable no-await-in-loop -- gậy sau tính điểm trên gậy trước, phải tuần tự */
    for (const kind of ['severe', 'normal'] as const) {
      const victim = await liveListingOf(app, user, { categoryId: category });
      await reported(app, await newUser(app), aboutListing(victim.id), 'fraud');
      await deliverAll(app);
      const res = await decideOps(app, staff, aboutListing(victim.id), {
        outcome: 'violation',
        report: { verdict: 'upheld' },
        strike: { kind, ruleArticleId: (await anyArticle()).id },
      });
      expect(res.statusCode, res.body).toBe(200);
      await deliverAll(app);
    }
    /* oxlint-enable no-await-in-loop */
    const res = await buy(user, listing.id, 'rank_to_top');
    expect(res.statusCode).toBe(409);
    expect(errorOf(res).code).toBe('POSTING_LOCKED');
    expect(await balanceOf(user)).toBe(5);
  });
});

describe('Thời gian chờ và trần ngày', () => {
  it('mua lại cùng gói sau 2 giờ → 429 PROMOTION_COOLDOWN kèm mốc; gói khác vẫn mua được; đủ 24 giờ mua lại được', async () => {
    const user = await buyer(10);
    const listing = await liveListingOf(app, user, { categoryId: await seedCategory() });
    expect((await buy(user, listing.id, 'rank_to_top')).statusCode).toBe(200);
    const boughtAt = now;
    now = new Date(boughtAt.getTime() + 2 * HOUR_MS);
    const early = await buy(user, listing.id, 'rank_to_top');
    expect(early.statusCode).toBe(429);
    expect(errorOf(early)).toMatchObject({
      code: 'PROMOTION_COOLDOWN',
      details: { retryAt: new Date(boughtAt.getTime() + DAY_MS).toISOString() },
    });
    expect(await balanceOf(user)).toBe(9);
    const { products: list } = await products(user, listing.id);
    expect(list.find((p) => p.code === 'rank_to_top')).toMatchObject({
      purchasable: false,
      retryAt: new Date(boughtAt.getTime() + DAY_MS).toISOString(),
    });
    expect((await buy(user, listing.id, 'featured_3d')).statusCode).toBe(200);
    now = new Date(boughtAt.getTime() + DAY_MS);
    expect((await buy(user, listing.id, 'rank_to_top')).statusCode).toBe(200);
  });

  it('lượt thứ tư trong ngày → 429 PROMOTION_DAILY_LIMIT kèm 0h hôm sau; hai lượt song song sát trần chỉ một thành công', async () => {
    const category = await seedCategory();
    const user = await buyer(10);
    const listings = await Promise.all(
      Array.from({ length: 4 }, () => liveListingOf(app, user, { categoryId: category })),
    );
    for (const listing of listings.slice(0, 2)) {
      // oxlint-disable-next-line no-await-in-loop
      expect((await buy(user, listing.id, 'rank_to_top')).statusCode).toBe(200);
    }
    const race = await Promise.all([
      buy(user, listings[2]?.id ?? '', 'rank_to_top'),
      buy(user, listings[3]?.id ?? '', 'rank_to_top'),
    ]);
    expect(race.map((r) => r.statusCode).toSorted()).toEqual([200, 429]);
    const blocked = race.find((r) => r.statusCode === 429);
    expect(blocked && errorOf(blocked)).toMatchObject({
      code: 'PROMOTION_DAILY_LIMIT',
      details: { retryAt: '2026-10-10T17:00:00.000Z' },
    });
    expect(await balanceOf(user)).toBe(7);
  });
});

describe('Gói trong nhóm', () => {
  it('tin nhóm đẩy lên đầu chỉ đổi bảng tin nhóm; chủ nhóm tắt gói → 409 GROUP_PROMOTIONS_OFF, gói đã mua chạy tiếp', async () => {
    const category = await seedCategory();
    const group = await createActiveGroup(app, { master });
    const user = await addMember(app, group.groupId);
    await seedTier(user.id, 'T1');
    await api(app, 'POST', `/ops/wallets/${user.id}/adjust`, master.token, {
      amount: 5,
      reason: 'thử gói nhóm',
      idempotencyKey: key(),
    });
    const inGroup = { placement: 'members_only', groupId: group.groupId, categoryId: category };
    const older = await liveListingOf(app, user, inGroup);
    now = new Date(now.getTime() + HOUR_MS);
    const newer = await liveListingOf(app, user, inGroup);
    const market = await liveListingOf(app, await buyer(), { categoryId: category });
    now = new Date(now.getTime() + HOUR_MS);
    expect((await groupFeedIds(group, user)).slice(0, 2)).toEqual([newer.id, older.id]);

    const res = await buy(user, older.id, 'featured_3d');
    expect(res.statusCode, res.body).toBe(200);
    expect((await buy(user, older.id, 'rank_to_top')).statusCode).toBe(200);
    expect((await groupFeedIds(group, user)).slice(0, 2)).toEqual([older.id, newer.id]);
    expect(await feedIds(`?categoryId=${category}`)).toEqual([market.id]);

    await groupSettings(app, group.owner, group.groupId, { allowPromotions: false });
    const off = await buy(user, newer.id, 'rank_to_top');
    expect(off.statusCode).toBe(409);
    expect(errorOf(off).code).toBe('GROUP_PROMOTIONS_OFF');
    expect(await balanceOf(user)).toBe(2);
    expect((await products(user, newer.id)).products.every((p) => !p.purchasable)).toBe(true);
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: older.id } })).featuredUntil,
    ).toEqual(new Date(TEST_NOW.getTime() + 2 * HOUR_MS + 3 * DAY_MS));
    const profile = dataOf<{ allowPromotions: boolean }>(
      await api(app, 'GET', `/groups/${group.groupId}`, user.token),
    );
    expect(profile.allowPromotions).toBe(false);
  });
});

describe('Hoàn Xu', () => {
  it('tin có gói nổi bật 7 ngày bị gỡ vì vi phạm ở ngày 2, khiếu nại thắng ngày 5: hoàn 4 Xu một lần dù sự kiện phát lại', async () => {
    const category = await seedCategory();
    const staff = await staffOf(app, [category]);
    const reviewer = await staffOf(app, [category]);
    const user = await buyer(4);
    const listing = await liveListingOf(app, user, { categoryId: category });
    const bought = await buy(user, listing.id, 'featured_7d');
    expect(bought.statusCode, bought.body).toBe(200);
    expect(await balanceOf(user)).toBe(0);

    now = new Date(TEST_NOW.getTime() + 2 * DAY_MS);
    await reported(app, await newUser(app), aboutListing(listing.id), 'fraud');
    await deliverAll(app);
    const removed = await decideOps(app, staff, aboutListing(listing.id), {
      outcome: 'violation',
      report: { verdict: 'upheld' },
      strike: { kind: 'normal', ruleArticleId: (await anyArticle()).id },
    });
    expect(removed.statusCode, removed.body).toBe(200);
    await deliverAll(app);
    const strikeId = dataOf<{ strikeId: string }>(removed).strikeId;
    expect(await balanceOf(user)).toBe(0);

    now = new Date(TEST_NOW.getTime() + 5 * DAY_MS);
    expect((await appeal(app, user, strikeId)).statusCode).toBe(201);
    await deliverAll(app);
    const won = await decideStrike(app, reviewer, strikeId, {
      outcome: 'keep',
      appeal: { verdict: 'won' },
    });
    expect(won.statusCode, won.body).toBe(200);
    await deliverAll(app);
    expect(await balanceOf(user)).toBe(4);
    const refund = await prisma.walletTransaction.findFirst({
      where: { accountId: user.id, type: 'refund' },
    });
    expect(refund).toMatchObject({ amount: 4, refs: { purchaseId: dataOf<Purchase>(bought).id } });
    expect(
      await prisma.promotionPurchase.findUniqueOrThrow({
        where: { id: dataOf<Purchase>(bought).id },
      }),
    ).toMatchObject({
      status: 'refunded',
      refundTransactionId: refund?.id,
    });
    expect((await getOwn(app, user, listing.id)).state).toBe('live');

    // Sự kiện phát lại: không hoàn lần hai.
    await app.modules.promotion.refundOnRestore(listing.id);
    expect(await balanceOf(user)).toBe(4);
  });

  it('gỡ vì vi phạm, không khiếu nại: không hoàn', async () => {
    const category = await seedCategory();
    const staff = await staffOf(app, [category]);
    const user = await buyer(2);
    const listing = await liveListingOf(app, user, { categoryId: category });
    expect((await buy(user, listing.id, 'featured_3d')).statusCode).toBe(200);
    await reported(app, await newUser(app), aboutListing(listing.id), 'fraud');
    await deliverAll(app);
    const removed = await decideOps(app, staff, aboutListing(listing.id), {
      outcome: 'violation',
      report: { verdict: 'upheld' },
      strike: { kind: 'normal', ruleArticleId: (await anyArticle()).id },
    });
    expect(removed.statusCode, removed.body).toBe(200);
    await deliverAll(app);
    expect(await balanceOf(user)).toBe(0);
    expect(
      await prisma.walletTransaction.count({ where: { accountId: user.id, type: 'refund' } }),
    ).toBe(0);
  });
});
