import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from './db-helpers.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { createFakePush, type FakePush } from './fakes/push.fake.js';
import { api, deliverAll, newMaster, newUser, seedTier, type TestUser } from './group-helpers.js';
import { liveListingOf } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import { buildTestApp, TEST_NOW } from './test-app.js';

/*
 * N60, N61 (change add-promotions, delta notification/listing-notices): mua gói → outbox của `promotion` → ma trận →
 * hộp thư nhóm "tin đăng của bạn", có nhắc, không số Xu; job nhắc sắp hết nổi bật một lần mỗi lượt mua.
 */
const HOUR_MS = 3_600_000;
let now = TEST_NOW;
let app: FastifyInstance;
let master: TestUser;
let push: FakePush;
let jobs: FakeJobs;
let seq = 0;

beforeAll(async () => {
  push = createFakePush();
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => now, screening: interimScreening, push, jobs });
  await app.ready();
  await app.modules.promotion.ensureProducts();
  master = await newMaster(app);
});

beforeEach(async () => {
  now = TEST_NOW;
  await deliverAll(app);
  await jobs.runAll();
  push.sent.length = 0;
});

afterAll(() => app.close());

const inbox = (user: TestUser) =>
  prisma.notification.findMany({
    where: { recipientId: user.id, type: { startsWith: 'promotion.' } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

async function buyerWithPhone() {
  const user = await newUser(app);
  await seedTier(user.id, 'T1');
  seq += 1;
  const token = `ExponentPushToken[promo-${seq}]`;
  expect((await api(app, 'PUT', '/me/push-token', user.token, { token })).statusCode).toBe(204);
  const grant = await api(app, 'POST', `/ops/wallets/${user.id}/adjust`, master.token, {
    amount: 10,
    reason: 'thử thông báo gói',
    idempotencyKey: `np${seq.toString().padStart(8, '0')}`,
  });
  expect(grant.statusCode, grant.body).toBe(200);
  // Lượt cấp Xu cũng đẩy (N59) — giao xong rồi xoá, để phần đẩy của gói đứng riêng.
  await deliverAll(app);
  await jobs.runAll();
  push.sent.length = 0;
  return { user, token };
}

const buy = async (user: TestUser, listingId: string, productCode: string) => {
  seq += 1;
  const res = await api(app, 'POST', `/listings/${listingId}/promotions`, user.token, {
    productCode,
    idempotencyKey: `nb${seq.toString().padStart(8, '0')}`,
  });
  expect(res.statusCode, res.body).toBe(200);
  await deliverAll(app);
  await jobs.runAll();
  return (res.json() as { data: { id: string } }).data.id;
};

describe('Báo người đăng về gói đẩy tin', () => {
  it('nổi bật 7 ngày: "«tiêu đề» nổi bật tới ngày …" có nhắc, mở tin, không số Xu; đẩy lên đầu có câu riêng', async () => {
    const { user, token } = await buyerWithPhone();
    const listing = await liveListingOf(app, user, { categoryId: await seedCategory() });
    const purchaseId = await buy(user, listing.id, 'featured_7d');
    await buy(user, listing.id, 'rank_to_top');
    const rows = await inbox(user);
    expect(rows.map((row) => row.body)).toEqual([
      `«${listing.title}» nổi bật tới ngày 17/10/2026.`,
      `«${listing.title}» đã được đẩy lên đầu bảng tin.`,
    ]);
    expect(rows[0]).toMatchObject({
      category: 'your_listings',
      type: 'promotion.applied',
      title: 'Ghim',
      alert: true,
      data: { listingId: listing.id, purchaseId },
    });
    expect(rows.every((row) => !/Xu/.test(row.body))).toBe(true);
    expect(push.sent.filter((m) => m.to === token).map((m) => m.body)).toEqual(
      rows.map((row) => row.body),
    );
  });

  it('sắp hết nổi bật: job nhắc một lần trước 24 giờ, chạy lại không nhắc lại, gói đã hết hạn không nhắc', async () => {
    const { user } = await buyerWithPhone();
    const listing = await liveListingOf(app, user, { categoryId: await seedCategory() });
    await buy(user, listing.id, 'featured_3d');
    now = new Date(TEST_NOW.getTime() + 2 * 24 * HOUR_MS - HOUR_MS);
    expect(await app.modules.promotion.remindExpiring()).toBe(0);
    now = new Date(TEST_NOW.getTime() + 2 * 24 * HOUR_MS);
    expect(await app.modules.promotion.remindExpiring()).toBe(1);
    await deliverAll(app);
    expect(await app.modules.promotion.remindExpiring()).toBe(0);
    const rows = (await inbox(user)).filter((row) => row.type === 'promotion.expiring');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe(`«${listing.title}» sắp hết nổi bật — hết ngày 13/10/2026.`);
    expect(rows[0]?.alert).toBe(true);
  });
});
