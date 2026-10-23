import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import type { TrustTier } from '../src/modules/listing/listing.ports.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  addMember,
  api,
  appointModerator,
  createActiveGroup,
  createUnit,
  deliverAll,
  newMaster,
  newUser,
  type TestUser,
} from './group-helpers.js';
import { getOwn, listingApi, liveListingOf } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import {
  aboutAccount,
  aboutListing,
  decideOps,
  openReportOf,
  openTaskOf,
  opsQueueIds,
  reported,
  type Subject,
  tieredTrust,
} from './report-helpers.js';
import { tokenFor } from './ops-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Spec review/reports (quyết định, hệ quả, người báo được báo, giấu danh tính), identity/account-deletion và
 * listing/deletion (báo cáo xử trên bản lưu) qua HTTP và bên nghe thật (add-reports).
 */
const DAY_MS = 86_400_000;
let now = TEST_NOW;
const tiers = new Map<string, TrustTier>();
let app: FastifyInstance;
let master: TestUser;

beforeAll(async () => {
  app = await buildTestApp({
    clock: () => now,
    trust: tieredTrust(tiers),
    screening: interimScreening,
  });
  await app.ready();
  await app.modules.review.ensureReasonTemplates();
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
const codeOf = (res: Res) => (res.json() as { error: { code: string } }).error.code;
type Mine = { reportId: string; status: string };

const staffOf = async (categoryIds: string[], scopes: 'user_reports'[] = []) => {
  const user = await newUser(app);
  await grantStaff(user.id, scopes, categoryIds);
  return user;
};

const anyTemplateId = async (): Promise<string> => {
  const res = await api(app, 'GET', '/ops/review/reason-templates', master.token);
  const [first] = (res.json() as { data: { id: string }[] }).data;
  if (!first) throw new Error('Chưa có lý do mẫu');
  return first.id;
};

const myReports = async (user: TestUser): Promise<{ body: string; items: Mine[] }> => {
  const res = await api(app, 'GET', '/me/reports', user.token);
  return { body: res.body, items: (res.json() as { data: { items: Mine[] } }).data.items };
};

const noticesOf = (user: TestUser) =>
  prisma.notification.findMany({ where: { recipientId: user.id, type: 'review.report.decided' } });

/** Tin sàn của một danh mục có staff, kèm `count` người đã báo nó. */
async function reportedListing(count: number, category = 'fraud') {
  const categoryId = await seedCategory();
  const staff = await staffOf([categoryId]);
  const poster = await newUser(app);
  const live = await liveListingOf(app, poster, { categoryId });
  const reporters = await Promise.all(Array.from({ length: count }, () => newUser(app)));
  await sequentially(reporters, (reporter) =>
    reported(app, reporter, aboutListing(live.id), category, `may-${reporter.id}`),
  );
  return { staff, poster, live, reporters, subject: aboutListing(live.id) as Subject };
}

describe('Quyết định về báo cáo', () => {
  it('quyết việc có báo cáo mà không chọn đúng hay bác: 400 VALIDATION_ERROR, báo cáo vẫn mở', async () => {
    const { staff, subject } = await reportedListing(1);
    const res = await decideOps(app, staff, subject, { outcome: 'keep' });
    expect(res.statusCode).toBe(400);
    expect(codeOf(res)).toBe('VALIDATION_ERROR');
    expect((await openReportOf(subject))?.status).toBe('open');
  });

  it('bác một báo cáo có 3 người báo: báo cáo đóng, cả 3 lượt mang kết quả "bác"', async () => {
    const { staff, reporters, subject } = await reportedListing(3, 'misinformation');
    const res = await decideOps(app, staff, subject, {
      outcome: 'keep',
      report: { verdict: 'dismissed' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(await openReportOf(subject)).toBeNull();
    const seen = await Promise.all(
      reporters.map(async (reporter) => (await myReports(reporter)).items[0]),
    );
    for (const mine of seen) expect(mine).toMatchObject({ status: 'dismissed' });
  });
});

describe('Hệ quả khi báo cáo đúng', () => {
  it('staff danh mục xác nhận đúng và gỡ tin: tin bị gỡ, báo cáo đóng "đúng", tin mất tư cách tin sạch', async () => {
    const { staff, poster, live, subject } = await reportedListing(1);
    const res = await decideOps(app, staff, subject, {
      outcome: 'mistake',
      reasonTemplateId: await anyTemplateId(),
      report: { verdict: 'upheld' },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect((await getOwn(app, poster, live.id)).state).toBe('removed');
    expect(await prisma.report.findFirst({ where: { listingId: live.id } })).toMatchObject({
      status: 'upheld',
    });
    expect(
      await prisma.trustCleanListing.findUnique({ where: { listingId: live.id } }),
    ).toMatchObject({ voidCause: 'report' });
  });

  it('điều hành viên xác nhận đúng báo cáo "quấy rối" về tin trong nhóm và cấm người đăng: người đăng rời nhóm', async () => {
    const group = await createActiveGroup(app, { master });
    const unit = await createUnit(app, group, `10A ${randomUUID().slice(0, 4)}`);
    const moderator = await addMember(app, group.groupId, { unitId: unit });
    await appointModerator(app, group, moderator, unit);
    const poster = await addMember(app, group.groupId, { unitId: unit });
    const inside = await liveListingOf(app, poster, {
      placement: 'members_only',
      groupId: group.groupId,
    });
    await reported(app, await addMember(app, group.groupId), aboutListing(inside.id), 'harassment');
    const task = await openTaskOf(aboutListing(inside.id));
    const base = `/groups/${group.groupId}/review/tasks/${task.id}`;
    expect((await api(app, 'POST', `${base}/claim`, moderator.token)).statusCode).toBe(200);
    const res = await api(app, 'POST', `${base}/decision`, moderator.token, {
      outcome: 'keep',
      report: { verdict: 'upheld', banFromGroup: true },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(
      await prisma.groupMember.findUnique({
        where: { groupId_accountId: { groupId: group.groupId, accountId: poster.id } },
      }),
    ).toBeNull();
    expect(
      await prisma.groupBan.findUnique({
        where: { groupId_accountId: { groupId: group.groupId, accountId: poster.id } },
      }),
    ).not.toBeNull();
    expect(await prisma.report.findFirst({ where: { listingId: inside.id } })).toMatchObject({
      status: 'upheld',
    });
  });

  it('staff xác nhận đúng và chọn khoá tài khoản: 403 FORBIDDEN, không khoá, báo cáo vẫn mở', async () => {
    const { staff, poster, subject } = await reportedListing(1);
    const res = await decideOps(app, staff, subject, {
      outcome: 'keep',
      report: { verdict: 'upheld', lockAccount: true },
    });
    expect(res.statusCode).toBe(403);
    expect(codeOf(res)).toBe('FORBIDDEN');
    await deliverAll(app);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: poster.id } })).status).toBe(
      'active',
    );
    expect((await openReportOf(subject))?.status).toBe('open');
  });

  it('master xác nhận đúng báo cáo lừa đảo về một người và khoá tài khoản: tài khoản bị khoá', async () => {
    const person = await newUser(app);
    await reported(app, await newUser(app), aboutAccount(person.id), 'fraud');
    const res = await decideOps(app, master, aboutAccount(person.id), {
      outcome: 'keep',
      report: { verdict: 'upheld', lockAccount: true },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect((await prisma.account.findUniqueOrThrow({ where: { id: person.id } })).status).toBe(
      'locked',
    );
    expect(await prisma.report.findFirst({ where: { accountId: person.id } })).toMatchObject({
      status: 'upheld',
    });
  });
});

describe('Người báo được báo kết quả, không thấy người báo khác', () => {
  it('báo cáo bị bác: người báo thấy "bác" trong báo cáo của mình', async () => {
    const { staff, reporters, subject } = await reportedListing(1, 'other');
    await decideOps(app, staff, subject, { outcome: 'keep', report: { verdict: 'dismissed' } });
    expect((await myReports(reporters[0] as TestUser)).items[0]).toMatchObject({
      status: 'dismissed',
    });
  });

  it('một trong 3 người báo xem báo cáo của mình: không có hai người còn lại', async () => {
    const { reporters } = await reportedListing(3);
    const [first, second, third] = reporters as [TestUser, TestUser, TestUser];
    const { body, items } = await myReports(first);
    expect(items).toHaveLength(1);
    expect(body).not.toContain(second.id);
    expect(body).not.toContain(third.id);
  });

  it('báo cáo có 2 người được xác nhận đúng: mỗi người một thông báo "báo cáo của bạn", không nêu hệ quả', async () => {
    const { staff, reporters, subject } = await reportedListing(2);
    const res = await decideOps(app, staff, subject, {
      outcome: 'mistake',
      reasonTemplateId: await anyTemplateId(),
      report: { verdict: 'upheld' },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    const all = await Promise.all(reporters.map((reporter) => noticesOf(reporter)));
    for (const notices of all) {
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ category: 'your_reports' });
      expect(notices[0]?.body).toContain('vi phạm');
      expect(notices[0]?.body).not.toContain('gỡ');
    }
  });
});

describe('Có báo cáo đang mở vẫn tự xoá được tài khoản, báo cáo vẫn được xử', () => {
  it('người có tin đang bị báo cáo xoá tài khoản: xoá được, báo cáo vẫn mở trong hàng chờ', async () => {
    const { staff, poster, subject } = await reportedListing(1);
    const res = await api(app, 'DELETE', '/me', poster.token);
    expect(res.statusCode, res.body).toBe(204);
    await deliverAll(app);
    expect((await openReportOf(subject))?.status).toBe('open');
    expect(await opsQueueIds(app, staff)).toContain((await openTaskOf(subject)).id);
  });

  it('người đang bị báo "quấy rối" xoá tài khoản: báo cáo vẫn mở ở hàng staff việc an toàn', async () => {
    const safety = await staffOf([], ['user_reports']);
    const person = await newUser(app);
    await reported(app, await newUser(app), aboutAccount(person.id), 'harassment');
    expect((await api(app, 'DELETE', '/me', person.token)).statusCode).toBe(204);
    await deliverAll(app);
    expect(await opsQueueIds(app, safety)).toContain(
      (await openTaskOf(aboutAccount(person.id))).id,
    );
  });

  it('staff nhận việc về tin của tài khoản đã xoá 20 ngày trước: thấy tiêu đề, mô tả, giá, ảnh như lúc xoá', async () => {
    const { staff, poster, live, subject } = await reportedListing(1);
    await api(app, 'DELETE', '/me', poster.token);
    await deliverAll(app);
    now = new Date(TEST_NOW.getTime() + 20 * DAY_MS);
    const task = await openTaskOf(subject);
    expect(
      (await api(app, 'POST', `/ops/review/tasks/${task.id}/claim`, staff.token)).statusCode,
    ).toBe(200);
    const detail = await api(app, 'GET', `/ops/review/tasks/${task.id}`, staff.token);
    expect(detail.statusCode, detail.body).toBe(200);
    expect((detail.json() as { data: { listing: object } }).data.listing).toMatchObject({
      title: live.title,
      description: (await prisma.listing.findUniqueOrThrow({ where: { id: live.id } })).description,
      price: live.price,
      images: live.images,
    });
  });

  it('xác nhận đúng sau khi tài khoản đã xoá 30 ngày: báo cáo đóng "đúng", người báo được báo', async () => {
    const { staff, poster, reporters, subject } = await reportedListing(1);
    await api(app, 'DELETE', '/me', poster.token);
    await deliverAll(app);
    now = new Date(TEST_NOW.getTime() + 30 * DAY_MS);
    // Phiên cũ đã hết hạn vì 30 ngày không dùng — staff đăng nhập lại lúc này.
    const fresh = { ...staff, token: await tokenFor(app, staff.id, now) };
    const res = await decideOps(app, fresh, subject, {
      outcome: 'keep',
      report: { verdict: 'upheld' },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(await noticesOf(reporters[0] as TestUser)).toHaveLength(1);
  });

  it('đang bị báo cáo và đang là chủ nhóm xoá tài khoản: 409 ACCOUNT_DELETE_BLOCKED vì chủ nhóm, không nêu báo cáo', async () => {
    const group = await createActiveGroup(app, { master });
    await reported(app, await newUser(app), aboutAccount(group.owner.id), 'harassment');
    const res = await api(app, 'DELETE', '/me', group.owner.token);
    expect(res.statusCode).toBe(409);
    expect(codeOf(res)).toBe('ACCOUNT_DELETE_BLOCKED');
    expect(res.body).toContain('chủ nhóm');
    expect(res.body).not.toContain('báo cáo');
  });
});

describe('Tin đang bị báo cáo vẫn xoá được, báo cáo vẫn được xử', () => {
  it('người đăng xoá tin đang bị báo cáo: xoá được, người khác 404, báo cáo vẫn mở', async () => {
    const { poster, live, subject } = await reportedListing(1);
    const res = await listingApi(app, 'DELETE', `/listings/${live.id}`, poster);
    expect(res.statusCode, res.body).toBeLessThan(300);
    await deliverAll(app);
    expect(
      (await listingApi(app, 'GET', `/listings/${live.id}`, await newUser(app))).statusCode,
    ).toBe(404);
    expect((await openReportOf(subject))?.status).toBe('open');
  });

  it('staff nhận việc về tin đã xoá: thấy bản lưu của tin', async () => {
    const { staff, poster, live, subject } = await reportedListing(1);
    await listingApi(app, 'DELETE', `/listings/${live.id}`, poster);
    await deliverAll(app);
    const task = await openTaskOf(subject);
    const detail = await api(app, 'GET', `/ops/review/tasks/${task.id}`, staff.token);
    expect(detail.statusCode, detail.body).toBe(200);
    expect(
      (detail.json() as { data: { listing: object; listingDeleted: boolean } }).data,
    ).toMatchObject({ listing: { title: live.title, price: live.price }, listingDeleted: true });
  });

  it('staff bác báo cáo về tin đã xoá: báo cáo đóng "bác", người báo được báo', async () => {
    const { staff, poster, live, reporters, subject } = await reportedListing(1);
    await listingApi(app, 'DELETE', `/listings/${live.id}`, poster);
    await deliverAll(app);
    const res = await decideOps(app, staff, subject, {
      outcome: 'keep',
      report: { verdict: 'dismissed' },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(await prisma.report.findFirst({ where: { listingId: live.id } })).toMatchObject({
      status: 'dismissed',
    });
    expect(await noticesOf(reporters[0] as TestUser)).toHaveLength(1);
  });
});
