import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OPS_JOBS } from '../src/modules/ops/ops.jobs.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { outboxEvents, prisma } from './db-helpers.js';
import {
  addMember,
  api,
  createActiveGroup,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { liveListing, seedCategory, seedGroup, seedListing } from './listing-helpers.js';
import { listingApi, signedInAt } from './listing-http-helpers.js';
import { conversationsOf, opened, sent } from './messaging-helpers.js';
import { aboutListing, decideOps, reported } from './report-helpers.js';
import {
  agedOf,
  conversationExists,
  day,
  draftOf,
  imageCheckExists,
  imageExists,
  imageOf,
  listingExists,
  stoppedOf,
} from './retention-helpers.js';
import { staffOf, struck } from './strike-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec ops/data-retention cho tin đăng, nhóm đóng, tài khoản đã xoá, cùng ops/background-jobs (không mở tin, lịch 6 giờ
 * ghi sổ) qua lượt dọn thật của `ops` trên repository thật. Dòng ghi mốc TEST_NOW; test đẩy đồng hồ app tới trước.
 */
let now = TEST_NOW;
let app: FastifyInstance;
let jobs: FakeJobs;
let master: TestUser;

beforeAll(async () => {
  jobs = createFakeJobs();
  app = await buildTestApp({ clock: () => now, screening: interimScreening, jobs });
  await app.ready();
  await app.modules.review.ensureReasonTemplates();
  await app.modules.trust.ensureRuleArticles();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
  jobs.sent.length = 0;
  jobs.runs.length = 0;
});

afterAll(() => app.close());

const retention = () => app.modules.ops.runRetention({ budgetMs: 60_000 });
const publicGet = (id: string) => listingApi(app, 'GET', `/listings/${id}`, null);

describe('Bản nháp bỏ dở', () => {
  it('quá 7 ngày không sửa: lượt 6 giờ xoá hẳn kèm ảnh và dấu ảnh; nháp mới sửa 3 ngày trước còn nguyên; lượt vào sổ "xong"', async () => {
    const owner = await newUser(app);
    const category = await seedCategory();
    const stale = await draftOf(owner.id, category);
    const imageId = await imageOf({ kind: 'listing', id: stale.id }, owner.id);
    const fresh = await draftOf(owner.id, category, { createdAt: day(-10), updatedAt: day(5) });

    now = day(8);
    const outcome = await jobs.runScheduled(OPS_JOBS.purgeDrafts);
    expect(outcome).toEqual({ summary: { deleted: 1 } });
    expect(jobs.runs).toMatchObject([{ name: OPS_JOBS.purgeDrafts, status: 'done' }]);
    expect(await listingExists(stale.id)).toBe(false);
    expect(await listingExists(fresh.id)).toBe(true);
    expect(await imageExists(imageId)).toBe(false);
    expect((await outboxEvents()).map((event) => event.type)).toContain('media.images.deleted');
    await deliverAll(app);
    expect(await imageCheckExists(imageId)).toBe(false);
  });
});

describe('Tin bị từ chối / gỡ vì sai sót, tin bị gỡ khỏi nhóm', () => {
  it('90 ngày không sửa thì xoá hẳn; sửa 30 ngày trước thì còn; tin vi phạm không theo luật này', async () => {
    const owner = await newUser(app);
    const category = await seedCategory();
    const groupId = await seedGroup();
    const rejected = await stoppedOf(owner.id, category, { state: 'rejected', fault: 'mistake' });
    const edited = await stoppedOf(owner.id, category, {
      state: 'removed',
      fault: 'mistake',
      updatedAt: day(61),
    });
    const detached = await stoppedOf(owner.id, category, {
      placement: 'members_only',
      groupId,
      hideReasons: ['detached_by_group'],
      leftGroupAt: TEST_NOW,
    });

    now = day(91);
    const result = await retention();
    expect(result.counts.mistake).toBe(2);
    expect(await listingExists(rejected.id)).toBe(false);
    expect(await listingExists(detached.id)).toBe(false);
    expect(await listingExists(edited.id)).toBe(true);
  });
});

describe('Tin bị từ chối / gỡ vì vi phạm', () => {
  it('giữ tới khi gậy hết hạn + 30 ngày: 20 ngày sau hết hạn còn, hơn 30 ngày thì xoá hẳn mà quyết định và gậy còn', async () => {
    const category = await seedCategory();
    const staff = await staffOf(app, [category]);
    const poster = await newUser(app);
    const { strike, listing } = await struck(app, {
      staff,
      poster,
      categoryId: category,
      kind: 'normal',
    });
    expect(strike.expiresAt).toEqual(day(90));

    now = day(91);
    await app.modules.trust.expireStrikes();
    await deliverAll(app);
    now = day(110);
    await retention();
    expect(await listingExists(listing.id)).toBe(true);

    now = day(121);
    const result = await retention();
    expect(result.counts.violation).toBe(1);
    expect(await listingExists(listing.id)).toBe(false);
    expect(await prisma.reviewDecision.count({ where: { listingId: listing.id } })).toBe(1);
    expect(await prisma.strike.findUnique({ where: { id: strike.id } })).toMatchObject({
      listingId: listing.id,
      status: 'expired',
    });
  });
});

describe('Tin người đăng tự xoá, tin đã bán', () => {
  it('tự xoá: 20 ngày còn bản lưu, hơn 30 ngày xoá hẳn; đã bán: 100 ngày vẫn xem được, hơn 180 ngày thì 404', async () => {
    const owner = await newUser(app);
    const category = await seedCategory();
    const deleted = await agedOf(owner.id, category, { deletedAt: TEST_NOW });
    const sold = await agedOf(owner.id, category, { state: 'sold' });

    now = day(20);
    await retention();
    expect(await listingExists(deleted.id)).toBe(true);
    now = day(31);
    await retention();
    expect(await listingExists(deleted.id)).toBe(false);

    now = day(100);
    await retention();
    expect((await publicGet(sold.id)).statusCode).toBe(200);
    now = day(181);
    await retention();
    expect(await listingExists(sold.id)).toBe(false);
    expect((await publicGet(sold.id)).statusCode).toBe(404);
  });
});

describe('Tin hết hạn', () => {
  it('nhắc trước 7 ngày đúng một lần (N48), quá 1 năm xoá hẳn; gia hạn sau khi được nhắc thì không bị xoá theo hạn này', async () => {
    const owner = await newUser(app);
    const category = await seedCategory();
    const expired = (overrides = {}) =>
      seedListing(
        liveListing(owner.id, category, {
          state: 'expired',
          firstLiveAt: day(-30),
          expiresAt: TEST_NOW,
          shownSince: null,
          ...overrides,
        }),
      );
    const gone = await expired();
    const renewed = await expired();
    const inbox = () =>
      prisma.notification.findMany({
        where: { recipientId: owner.id, type: 'listing.purge.reminder' },
        orderBy: { createdAt: 'asc' },
      });

    now = day(357);
    await retention();
    await deliverAll(app);
    expect(await inbox()).toEqual([]);

    now = day(359);
    await retention();
    await deliverAll(app);
    const notices = await inbox();
    expect(notices).toHaveLength(2);
    expect(notices.map((row) => row.data)).toEqual(
      expect.arrayContaining([
        { listingId: gone.id, purgeAt: day(365).toISOString() },
        { listingId: renewed.id, purgeAt: day(365).toISOString() },
      ]),
    );
    expect(notices[0]?.body).toContain('sẽ bị xoá hẳn ngày');
    now = day(360);
    await retention();
    await deliverAll(app);
    expect(await inbox()).toHaveLength(2);

    // Gia hạn sau nhắc: tin lên bảng lại với hạn mới (luồng thật ở listing-display-period) — ở đây ghi thẳng kết quả.
    await prisma.listing.update({
      where: { id: renewed.id },
      data: { state: 'live', expiresAt: day(390), shownSince: day(360) },
    });
    now = day(366);
    const result = await retention();
    expect(result.counts.expired).toBe(1);
    expect(await listingExists(gone.id)).toBe(false);
    expect(await listingExists(renewed.id)).toBe(true);
  });
});

describe('Tin của nhóm đã đóng', () => {
  it('60 ngày sau khi đóng: tin và thành viên còn; hơn 90 ngày: tin và thành viên xoá hẳn, tin đã chuyển lên sàn chung còn, dòng nhóm còn', async () => {
    const { groupId, owner } = await createActiveGroup(app, { master });
    const member = await addMember(app, groupId);
    const category = await seedCategory();
    const inGroup = await seedListing(
      liveListing(member.id, category, { placement: 'members_only', groupId }),
    );
    const moved = await seedListing(
      liveListing(member.id, category, { movedFromListingId: inGroup.id }),
    );
    expect((await api(app, 'POST', `/groups/${groupId}/close`, owner.token)).statusCode).toBe(204);
    await deliverAll(app);
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id: inGroup.id } })).hideReasons,
    ).toEqual(['group_closed']);

    now = day(60);
    await retention();
    expect(await listingExists(inGroup.id)).toBe(true);
    expect(await prisma.groupMember.count({ where: { groupId } })).toBe(2);

    now = day(91);
    const result = await retention();
    expect(result.counts.closedGroups).toBe(1);
    expect(await listingExists(inGroup.id)).toBe(false);
    expect(await listingExists(moved.id)).toBe(true);
    expect(await prisma.groupMember.count({ where: { groupId } })).toBe(0);
    expect(await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).toMatchObject({
      state: 'closed',
      purgedAt: now,
    });
    await retention();
    expect(await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).toMatchObject({
      purgedAt: day(91),
    });
  });
});

describe('Tài khoản đã xoá', () => {
  it('60 ngày: tin ẩn mà chưa xoá hẳn; hơn 90 ngày: tin, ảnh đại diện (kèm dấu ảnh), hồ sơ giấy tờ bị xoá, hồ sơ ẩn danh; hội thoại với người còn lại vẫn đọc được', async () => {
    const [seller, buyer] = [await newUser(app), await newUser(app)];
    const category = await seedCategory();
    const listing = await seedListing(liveListing(seller.id, category));
    const listingImage = await imageOf({ kind: 'listing', id: listing.id }, seller.id);
    const avatar = await imageOf({ kind: 'profile', id: seller.id }, seller.id);
    await prisma.idVerification.create({
      data: {
        accountId: seller.id,
        documentType: 'cccd',
        documentNumberEnc: 'enc',
        fullName: 'Người bán',
        status: 'verified',
      },
    });
    const conversation = await opened(app, buyer, listing.id);
    await sent(app, buyer, conversation.id, 'Còn không bạn?');
    await repositories.identity.softDeleteAccount({
      accountId: seller.id,
      at: TEST_NOW,
      events: [{ type: 'identity.account.deleted', payload: { accountId: seller.id } }],
    });
    await deliverAll(app);
    expect((await publicGet(listing.id)).statusCode).toBe(404);

    now = day(60);
    await retention();
    expect(await listingExists(listing.id)).toBe(true);
    expect(await imageExists(avatar)).toBe(true);

    now = day(91);
    const result = await retention();
    expect(result.counts.deletedAccounts).toBe(1);
    expect(await listingExists(listing.id)).toBe(false);
    expect(await imageExists(listingImage)).toBe(false);
    expect(await imageExists(avatar)).toBe(false);
    await deliverAll(app);
    expect(await imageCheckExists(avatar)).toBe(false);
    expect(await imageCheckExists(listingImage)).toBe(false);
    expect(await prisma.idVerification.count({ where: { accountId: seller.id } })).toBe(0);
    expect(await prisma.account.findUniqueOrThrow({ where: { id: seller.id } })).toMatchObject({
      status: 'deleted',
      emailNormalized: `deleted:${seller.id}`,
      passwordHash: null,
      purgedAt: now,
    });
    expect(await conversationExists(conversation.id)).toBe(true);
    const later = await signedInAt(app, buyer, now);
    expect(await conversationsOf(app, later)).toMatchObject([
      {
        id: conversation.id,
        listing: { id: listing.id, title: null },
        lastMessage: { body: 'Còn không bạn?' },
      },
    ]);
  });

  it('tin đang có báo cáo mở ở lại bản lưu (xoá mềm) tới khi báo cáo đóng + 30 ngày, hồ sơ cũng chờ; tin khác xoá hẳn ngay', async () => {
    const seller = await newUser(app);
    const category = await seedCategory();
    const staff = await staffOf(app, [category]);
    const reportedListing = await seedListing(liveListing(seller.id, category));
    const plain = await seedListing(liveListing(seller.id, category));
    await reported(app, await newUser(app), aboutListing(reportedListing.id), 'fraud');
    await deliverAll(app);
    await repositories.identity.softDeleteAccount({
      accountId: seller.id,
      at: TEST_NOW,
      events: [{ type: 'identity.account.deleted', payload: { accountId: seller.id } }],
    });
    await deliverAll(app);

    now = day(91);
    await retention();
    expect(await listingExists(plain.id)).toBe(false);
    expect(
      await prisma.listing.findUniqueOrThrow({ where: { id: reportedListing.id } }),
    ).toMatchObject({
      deletedAt: now,
    });
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: seller.id } })).purgedAt,
    ).toBeNull();

    const reviewer = await signedInAt(app, staff, now);
    const decided = await decideOps(app, reviewer, aboutListing(reportedListing.id), {
      outcome: 'keep',
      report: { verdict: 'dismissed' },
    });
    expect(decided.statusCode, decided.body).toBe(200);
    now = day(91 + 20);
    await retention();
    expect(await listingExists(reportedListing.id)).toBe(true);
    now = day(91 + 31);
    await retention();
    expect(await listingExists(reportedListing.id)).toBe(false);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: seller.id } })).purgedAt).toEqual(
      now,
    );
  });
});

describe('Không việc nền nào tự mở tin', () => {
  it('tin chờ duyệt và tin tạm ẩn qua mọi lượt dọn vẫn không hiện với người mua', async () => {
    const owner = await newUser(app);
    const category = await seedCategory();
    const pending = await seedListing(
      liveListing(owner.id, category, {
        state: 'pending',
        firstLiveAt: null,
        expiresAt: null,
        shownSince: null,
      }),
    );
    const hidden = await seedListing(
      liveListing(owner.id, category, {
        hideReasons: ['account_locked'],
        shownSince: null,
      }),
    );
    now = day(400);
    await retention();
    await app.modules.ops.purgeDrafts();
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      state: 'pending',
    });
    expect((await publicGet(pending.id)).statusCode).toBe(404);
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: hidden.id } })).toMatchObject({
      hideReasons: ['account_locked'],
    });
    expect((await publicGet(hidden.id)).statusCode).toBe(404);
  });
});
