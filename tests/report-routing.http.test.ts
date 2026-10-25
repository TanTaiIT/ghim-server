import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sequentially } from '../src/common/utils/sequential.js';
import type { TrustTier } from '../src/modules/listing/listing.ports.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { prisma } from './db-helpers.js';
import {
  type ActiveGroup,
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
import { liveListingOf, machinePass, patch } from './listing-http-helpers.js';
import { seedCategory } from './listing-helpers.js';
import {
  aboutAccount,
  aboutListing,
  decideOps,
  groupQueueIds,
  openReportOf,
  openTaskOf,
  opsQueueIds,
  reported,
  tieredTrust,
} from './report-helpers.js';
import { buildTestApp, grantStaff, TEST_NOW } from './test-app.js';

/*
 * Spec review/reports "ai xử", "lừa đảo thắng khi gộp", "quá hạn", "chỉ đóng bằng quyết định", "báo cáo liên quan",
 * "người báo không xử báo cáo mình gửi" và group/group-lifecycle "đóng nhóm không huỷ báo cáo" (add-reports).
 */
const HOUR_MS = 3_600_000;
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
  master = await newMaster(app);
});

beforeEach(() => {
  now = TEST_NOW;
});

afterAll(() => app.close());

type Res = { statusCode: number; body: string; json(): unknown };
const codeOf = (res: Res) => (res.json() as { error: { code: string } }).error.code;

const staffOf = async (categoryIds: string[], scopes: 'user_reports'[] = []) => {
  const user = await newUser(app);
  await grantStaff(user.id, scopes, categoryIds);
  return user;
};

/** Nhóm có lớp 10A với một điều hành viên của lớp; người đăng ở 10A; staff danh mục của tin. */
async function school(mode?: 'private_invite') {
  const category = await seedCategory();
  const staff = await staffOf([category]);
  const group: ActiveGroup = await createActiveGroup(app, { master, ...(mode ? { mode } : {}) });
  const unit = await createUnit(app, group, `10A ${randomUUID().slice(0, 4)}`);
  const moderator = await addMember(app, group.groupId, { unitId: unit });
  await appointModerator(app, group, moderator, unit);
  const poster = await addMember(app, group.groupId, { unitId: unit });
  const inside = await liveListingOf(app, poster, {
    placement: 'members_only',
    groupId: group.groupId,
    categoryId: category,
  });
  return { category, staff, group, moderator, poster, inside };
}

describe('Ai xử báo cáo', () => {
  it('"sai thông tin" về tin trong nhóm: hàng điều hành viên của lớp, không ở hàng staff', async () => {
    const { staff, group, moderator, poster, inside } = await school();
    const member = await addMember(app, group.groupId);
    await reported(app, member, aboutListing(inside.id), 'misinformation');
    const task = await openTaskOf(aboutListing(inside.id));
    expect(task).toMatchObject({ queue: 1, reasons: ['report'] });
    expect(await groupQueueIds(app, moderator, group.groupId)).toContain(task.id);
    expect(await opsQueueIds(app, staff)).not.toContain(task.id);
    expect(poster.id).not.toBe(member.id);
  });

  it('"hàng cấm" về tin của nhóm riêng tư: hàng staff danh mục; điều hành viên, chủ nhóm không thấy, mở bằng mã → 404', async () => {
    const { staff, group, moderator, inside } = await school('private_invite');
    await reported(app, await addMember(app, group.groupId), aboutListing(inside.id), 'prohibited');
    const task = await openTaskOf(aboutListing(inside.id));
    expect(task.reasons).toEqual(['report_severe']);
    expect(await opsQueueIds(app, staff)).toContain(task.id);
    expect(await groupQueueIds(app, moderator, group.groupId)).not.toContain(task.id);
    expect(await groupQueueIds(app, group.owner, group.groupId)).not.toContain(task.id);
    const claim = await api(
      app,
      'POST',
      `/groups/${group.groupId}/review/tasks/${task.id}/claim`,
      moderator.token,
    );
    expect(claim.statusCode).toBe(404);
  });

  it('báo cáo về một người: hàng staff việc an toàn, không ở hàng staff chỉ có danh mục', async () => {
    const safety = await staffOf([], ['user_reports']);
    const categoryOnly = await staffOf([await seedCategory()]);
    const person = await newUser(app);
    await reported(app, await newUser(app), aboutAccount(person.id), 'harassment');
    const task = await openTaskOf(aboutAccount(person.id));
    expect(task).toMatchObject({ queue: 1, listingId: null, accountId: person.id });
    expect(await opsQueueIds(app, safety)).toContain(task.id);
    const other = await api(app, 'GET', '/ops/review/tasks', categoryOnly.token);
    expect(
      (other.json() as { data: { items: { id: string }[] } }).data.items.map((i) => i.id),
    ).not.toContain(task.id);
  });

  it('staff việc an toàn là người bị báo: hiện cho staff an toàn khác; không còn ai thì cho master', async () => {
    const reportedStaff = await staffOf([], ['user_reports']);
    const otherSafety = await staffOf([], ['user_reports']);
    await reported(app, await newUser(app), aboutAccount(reportedStaff.id), 'harassment');
    const task = await openTaskOf(aboutAccount(reportedStaff.id));
    expect(await opsQueueIds(app, reportedStaff)).not.toContain(task.id);
    expect(await opsQueueIds(app, otherSafety)).toContain(task.id);
    // Không còn staff an toàn nào khác (kể cả của các ca trước trong file) ngoài người bị báo.
    await prisma.staffPermission.updateMany({
      where: { accountId: { not: reportedStaff.id } },
      data: { scopes: [] },
    });
    const detail = await api(app, 'GET', `/ops/review/tasks/${task.id}`, master.token);
    expect((detail.json() as { data: { level: string } }).data.level).toBe('master');
  });

  it('staff báo một tin thuộc danh mục mình: không ở hàng staff đó, ở hàng staff khác cùng danh mục', async () => {
    const category = await seedCategory();
    const [reporterStaff, otherStaff] = [await staffOf([category]), await staffOf([category])];
    const live = await liveListingOf(app, await newUser(app), { categoryId: category });
    await reported(app, reporterStaff, aboutListing(live.id), 'other');
    const task = await openTaskOf(aboutListing(live.id));
    expect(await opsQueueIds(app, reporterStaff)).not.toContain(task.id);
    expect(await opsQueueIds(app, otherStaff)).toContain(task.id);
  });
});

describe('Lừa đảo và hàng cấm thắng khi gộp', () => {
  it('"lừa đảo" gộp vào "sai thông tin" ở hàng điều hành: báo cáo sang hàng staff, điều hành viên không thấy', async () => {
    const { staff, group, moderator, inside } = await school();
    await reported(
      app,
      await addMember(app, group.groupId),
      aboutListing(inside.id),
      'misinformation',
    );
    const task = await openTaskOf(aboutListing(inside.id));
    expect(await groupQueueIds(app, moderator, group.groupId)).toContain(task.id);
    await reported(app, await addMember(app, group.groupId), aboutListing(inside.id), 'fraud');
    expect(await groupQueueIds(app, moderator, group.groupId)).not.toContain(task.id);
    expect(await opsQueueIds(app, staff)).toContain(task.id);
    expect((await openReportOf(aboutListing(inside.id)))?.severe).toBe(true);
  });

  it('điều hành viên đang nhận báo cáo lúc lượt "lừa đảo" tới rồi quyết: 409 TASK_REASSIGNED, báo cáo vẫn mở', async () => {
    const { group, moderator, inside } = await school();
    await reported(app, await addMember(app, group.groupId), aboutListing(inside.id), 'harassment');
    const task = await openTaskOf(aboutListing(inside.id));
    const claim = await api(
      app,
      'POST',
      `/groups/${group.groupId}/review/tasks/${task.id}/claim`,
      moderator.token,
    );
    expect(claim.statusCode, claim.body).toBe(200);
    await reported(app, await addMember(app, group.groupId), aboutListing(inside.id), 'fraud');
    const res = await api(
      app,
      'POST',
      `/groups/${group.groupId}/review/tasks/${task.id}/decision`,
      moderator.token,
      { outcome: 'keep', report: { verdict: 'dismissed' } },
    );
    expect(res.statusCode, res.body).toBe(409);
    expect(codeOf(res)).toBe('TASK_REASSIGNED');
    expect((await openReportOf(aboutListing(inside.id)))?.status).toBe('open');
  });
});

describe('Báo cáo quá hạn chuyển master, chỉ đóng bằng quyết định', () => {
  it('72 giờ chưa ai quyết: việc ở hàng master, báo cáo vẫn mở', async () => {
    const category = await seedCategory();
    await staffOf([category]);
    const live = await liveListingOf(app, await newUser(app), { categoryId: category });
    await reported(app, await newUser(app), aboutListing(live.id), 'other');
    now = new Date(TEST_NOW.getTime() + 72 * HOUR_MS + 60_000);
    await app.modules.review.everyMinute();
    const task = await openTaskOf(aboutListing(live.id));
    expect(task.escalatedAt).not.toBeNull();
    const detail = await api(app, 'GET', `/ops/review/tasks/${task.id}`, master.token);
    expect((detail.json() as { data: { level: string } }).data.level).toBe('master');
    expect((await openReportOf(aboutListing(live.id)))?.status).toBe('open');
  });

  it('người đăng sửa tin đang bị báo cáo và máy cho bản sửa qua: báo cáo vẫn mở trong hàng chờ', async () => {
    const poster = await newUser(app);
    const live = await liveListingOf(app, poster);
    await reported(app, await newUser(app), aboutListing(live.id), 'misinformation');
    const edited = await patch(app, poster, live, { title: 'Tiêu đề đã sửa lại' });
    expect(edited.statusCode, edited.body).toBe(200);
    const sent = (edited.json() as { data: { id: string; version: number } }).data;
    await machinePass(app, poster, sent);
    await deliverAll(app);
    expect((await openReportOf(aboutListing(live.id)))?.status).toBe('open');
    expect((await openTaskOf(aboutListing(live.id))).reasons).toContain('report');
  });
});

describe('Người xử thấy báo cáo liên quan', () => {
  it('staff nhận việc về tin có 3 lượt "lừa đảo": thấy loại, 3 người báo, lúc từng lượt — không có ai báo', async () => {
    const category = await seedCategory();
    const staff = await staffOf([category]);
    const live = await liveListingOf(app, await newUser(app), { categoryId: category });
    const reporters = [await newUser(app), await newUser(app), await newUser(app)];
    await sequentially(reporters, async (reporter) => {
      const index = reporters.indexOf(reporter);
      now = new Date(TEST_NOW.getTime() + index * HOUR_MS);
      await reported(app, reporter, aboutListing(live.id), 'fraud', `may-${index}`);
    });
    const task = await openTaskOf(aboutListing(live.id));
    const detail = await api(app, 'GET', `/ops/review/tasks/${task.id}`, staff.token);
    expect(detail.statusCode, detail.body).toBe(200);
    const [open] = (
      detail.json() as {
        data: {
          reports: { status: string; reporterCount: number; entries: { category: string }[] }[];
        };
      }
    ).data.reports;
    expect(open).toMatchObject({ status: 'open', reporterCount: 3 });
    expect(open?.entries.map((entry) => entry.category)).toEqual(['fraud', 'fraud', 'fraud']);
    for (const reporter of reporters) expect(detail.body).not.toContain(reporter.id);
  });

  it('điều hành viên mở việc về tin trong nhóm: chỉ báo cáo thường về chính tin — không hàng cấm đã đóng, tin khác, về người', async () => {
    const { staff, group, moderator, poster, inside } = await school();
    const member = () => addMember(app, group.groupId);
    await reported(app, await member(), aboutListing(inside.id), 'prohibited', 'may-cam');
    const dismissed = await decideOps(app, staff, aboutListing(inside.id), {
      outcome: 'keep',
      report: { verdict: 'dismissed' },
    });
    expect(dismissed.statusCode, dismissed.body).toBe(200);
    const elsewhere = await liveListingOf(app, poster);
    await reported(
      app,
      await newUser(app),
      aboutListing(elsewhere.id),
      'misinformation',
      'may-khac',
    );
    await reported(app, await newUser(app), aboutAccount(poster.id), 'harassment', 'may-nguoi');
    await reported(app, await member(), aboutListing(inside.id), 'misinformation', 'may-thuong');
    const task = await openTaskOf(aboutListing(inside.id));
    type Related = { subjectKind: string; listingId: string | null; severe: boolean };
    const reportsSeen = async (path: string, token: string) => {
      const res = await api(app, 'GET', path, token);
      expect(res.statusCode, res.body).toBe(200);
      const data = (res.json() as { data: { reports: Related[]; conversations: unknown[] } }).data;
      return { reports: data.reports.map((r) => [r.subjectKind, r.listingId, r.severe]), data };
    };
    const asModerator = await reportsSeen(
      `/groups/${group.groupId}/review/tasks/${task.id}`,
      moderator.token,
    );
    expect(asModerator.reports).toEqual([['listing', inside.id, false]]);
    expect(asModerator.data.conversations).toEqual([]);
    const asMaster = await reportsSeen(`/ops/review/tasks/${task.id}`, master.token);
    expect(asMaster.reports).toHaveLength(4);
  });
});

async function closeGroup(group: ActiveGroup) {
  const res = await api(app, 'POST', `/groups/${group.groupId}/close`, group.owner.token);
  expect(res.statusCode, res.body).toBe(204);
  await deliverAll(app);
}

describe('Đóng nhóm không huỷ báo cáo', () => {
  it('nhóm đóng khi có báo cáo "hàng cấm": vẫn mở trong hàng staff danh mục', async () => {
    const { staff, group, inside } = await school();
    await reported(app, await addMember(app, group.groupId), aboutListing(inside.id), 'prohibited');
    await closeGroup(group);
    const task = await openTaskOf(aboutListing(inside.id));
    expect(await opsQueueIds(app, staff)).toContain(task.id);
    expect((await openReportOf(aboutListing(inside.id)))?.status).toBe('open');
  });

  it('nhóm đóng khi có báo cáo "sai thông tin" ở hàng điều hành: vẫn mở, sang hàng staff danh mục', async () => {
    const { staff, group, moderator, inside } = await school();
    await reported(
      app,
      await addMember(app, group.groupId),
      aboutListing(inside.id),
      'misinformation',
    );
    await closeGroup(group);
    const task = await openTaskOf(aboutListing(inside.id));
    expect(await opsQueueIds(app, staff)).toContain(task.id);
    const queue = await api(app, 'GET', `/groups/${group.groupId}/review/tasks`, moderator.token);
    expect(queue.body).not.toContain(task.id);
  });

  it('staff xác nhận đúng báo cáo "lừa đảo" về tin của nhóm đã đóng: báo cáo đóng "đúng", người báo được báo', async () => {
    const { staff, group, inside } = await school();
    const reporter = await addMember(app, group.groupId);
    await reported(app, reporter, aboutListing(inside.id), 'fraud');
    await closeGroup(group);
    const res = await decideOps(app, staff, aboutListing(inside.id), {
      outcome: 'keep',
      report: { verdict: 'upheld' },
    });
    expect(res.statusCode, res.body).toBe(200);
    await deliverAll(app);
    expect(await prisma.report.findFirst({ where: { listingId: inside.id } })).toMatchObject({
      status: 'upheld',
    });
    const notices = await prisma.notification.findMany({
      where: { recipientId: reporter.id, type: 'review.report.decided' },
    });
    expect(notices).toHaveLength(1);
  });
});
