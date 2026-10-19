import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { interimScreening } from './fakes/listing-ports.fake.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { prisma } from './db-helpers.js';
import { api, deliverAll, newUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { listingApi, signedInAt } from './listing-http-helpers.js';
import { conversationsOf, opened, sent } from './messaging-helpers.js';
import { aboutAccount, aboutListing, decideOps, reported } from './report-helpers.js';
import { agedOf, conversationExists, day, listingExists } from './retention-helpers.js';
import { staffOf, struck } from './strike-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec ops/evidence-hold: dữ liệu dính tới báo cáo, gậy, khiếu nại đang mở không bị xoá hẳn dù hạn lưu đã qua hay các bên
 * đã tự xoá; gỡ sau khi việc đóng 30 ngày; không làm dữ liệu đã xoá hiện lại.
 */
let now = TEST_NOW;
let app: FastifyInstance;
let jobs: FakeJobs;

beforeAll(async () => {
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => now, screening: interimScreening, jobs });
  await app.ready();
  await app.modules.review.ensureReasonTemplates();
  await app.modules.trust.ensureRuleArticles();
});

beforeEach(() => {
  now = TEST_NOW;
  jobs.sent.length = 0;
});

afterAll(() => app.close());

const retention = () => app.modules.ops.runRetention({ budgetMs: 60_000 });
const dismiss = { outcome: 'keep', report: { verdict: 'dismissed' } };

async function reportedSetup(category: string) {
  const [owner, reporter] = [await newUser(app), await newUser(app)];
  const listing = await seedListing(liveListing(owner.id, category));
  await reported(app, reporter, aboutListing(listing.id), 'fraud');
  await deliverAll(app);
  return { owner, reporter, listing };
}

describe('Người đăng xoá tin đang bị báo cáo', () => {
  it('30 ngày trôi qua mà báo cáo chưa đóng: tin chưa xoá hẳn, người xử mở được bản lưu, người khác nhận 404; đóng 20 ngày còn, đóng hơn 30 ngày xoá hẳn', async () => {
    const category = await seedCategory();
    const staff = await staffOf(app, [category]);
    const { owner, listing } = await reportedSetup(category);
    expect((await listingApi(app, 'DELETE', `/listings/${listing.id}`, owner)).statusCode).toBe(
      204,
    );
    await deliverAll(app);

    now = day(31);
    await retention();
    expect(await listingExists(listing.id)).toBe(true);
    expect((await listingApi(app, 'GET', `/listings/${listing.id}`, null)).statusCode).toBe(404);
    const reviewer = await signedInAt(app, staff, now);
    const task = await prisma.reviewTask.findFirstOrThrow({
      where: { listingId: listing.id, status: 'open' },
    });
    const detail = await api(app, 'GET', `/ops/review/tasks/${task.id}`, reviewer.token);
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().data.listing).toMatchObject({ title: 'Xe đạp cũ' });

    const decided = await decideOps(app, reviewer, aboutListing(listing.id), dismiss);
    expect(decided.statusCode, decided.body).toBe(200);
    now = day(31 + 20);
    await retention();
    expect(await listingExists(listing.id)).toBe(true);
    now = day(31 + 31);
    await retention();
    expect(await listingExists(listing.id)).toBe(false);
  });
});

describe('Hội thoại dính tới báo cáo', () => {
  it('gửi kèm báo cáo rồi cả hai bên xoá: không xoá hẳn, không hiện lại với bên đã xoá; báo cáo đóng + 30 ngày thì xoá hẳn', async () => {
    const category = await seedCategory();
    const staff = await staffOf(app, [], ['user_reports']);
    const [seller, buyer] = [await newUser(app), await newUser(app)];
    const listing = await seedListing(liveListing(seller.id, category));
    const conversation = await opened(app, buyer, listing.id);
    await sent(app, buyer, conversation.id, 'Chuyển khoản trước đi');
    const report = await api(
      app,
      'POST',
      `/me/conversations/${conversation.id}/reports`,
      seller.token,
      {
        category: 'fraud',
      },
    );
    expect(report.statusCode, report.body).toBe(201);
    await deliverAll(app);
    const removed = await Promise.all(
      [seller, buyer].map((user) =>
        api(app, 'DELETE', `/me/conversations/${conversation.id}`, user.token),
      ),
    );
    expect(removed.map((res) => res.statusCode)).toEqual([204, 204]);

    now = day(1);
    await retention();
    expect(await conversationExists(conversation.id)).toBe(true);
    expect(await conversationsOf(app, seller)).toEqual([]);

    const reviewer = await signedInAt(app, staff, now);
    const decided = await decideOps(app, reviewer, aboutAccount(buyer.id), dismiss);
    expect(decided.statusCode, decided.body).toBe(200);
    now = day(1 + 20);
    await retention();
    expect(await conversationExists(conversation.id)).toBe(true);
    now = day(1 + 31);
    await retention();
    expect(await conversationExists(conversation.id)).toBe(false);
  });

  it('hội thoại một năm không ai nhắn về tin đang có báo cáo quá hạn: không xoá hẳn', async () => {
    const category = await seedCategory();
    const { listing } = await reportedSetup(category);
    const buyer = await newUser(app);
    const conversation = await opened(app, buyer, listing.id);
    now = day(400);
    await app.modules.review.everyMinute();
    await retention();
    expect(await conversationExists(conversation.id)).toBe(true);
  });
});

describe('Xoá tài khoản khi còn gậy thường', () => {
  it('90 ngày trôi qua lúc gậy chưa hết hạn: tin bị gỡ vì vi phạm chưa xoá hẳn; gậy hết hạn + 30 ngày thì xoá', async () => {
    const category = await seedCategory();
    const staff = await staffOf(app, [category]);
    const poster = await newUser(app);
    const { listing } = await struck(app, { staff, poster, categoryId: category, kind: 'normal' });
    await repositories.identity.softDeleteAccount({
      accountId: poster.id,
      at: TEST_NOW,
      events: [{ type: 'identity.account.deleted', payload: { accountId: poster.id } }],
    });
    await deliverAll(app);

    now = day(91);
    await app.modules.trust.expireStrikes();
    await deliverAll(app);
    await retention();
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({
      state: 'rejected',
      fault: 'violation',
      deletedAt: now,
    });
    now = day(100);
    await retention();
    expect(await listingExists(listing.id)).toBe(true);
    now = day(122);
    await retention();
    expect(await listingExists(listing.id)).toBe(false);
  });
});

describe('Tạm giữ thắng mọi hạn lưu', () => {
  it('tin đã bán quá 180 ngày đang có báo cáo mở: lượt dọn không xoá; báo cáo về một người giữ mọi tin của người đó', async () => {
    const category = await seedCategory();
    const [owner, reporter] = [await newUser(app), await newUser(app)];
    const sold = await agedOf(owner.id, category, { state: 'sold' });
    await reported(app, reporter, aboutListing(sold.id), 'misinformation');
    const target = await newUser(app);
    const deletedOfTarget = await seedListing(
      liveListing(target.id, category, { deletedAt: TEST_NOW }),
    );
    await reported(app, reporter, aboutAccount(target.id), 'harassment');
    await deliverAll(app);

    now = day(200);
    await app.modules.review.everyMinute();
    await retention();
    expect(await listingExists(sold.id)).toBe(true);
    expect(await listingExists(deletedOfTarget.id)).toBe(true);
  });
});
