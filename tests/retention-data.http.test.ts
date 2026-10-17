import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OPS_JOBS } from '../src/modules/ops/ops.jobs.js';
import { createOpsRepository } from '../src/modules/ops/ops.repository.js';
import { interimScreening } from './fakes/listing-ports.fake.js';
import { createFakeJobs, type FakeJobs } from './fakes/jobs.fake.js';
import { auditOf, prisma } from './db-helpers.js';
import { api, deliverAll, newMaster, newUser, type TestUser } from './group-helpers.js';
import { liveListing, seedCategory, seedListing } from './listing-helpers.js';
import { signedInAt } from './listing-http-helpers.js';
import { conversationsOf, messagesOf, opened, sent } from './messaging-helpers.js';
import { aboutAccount, aboutListing, decideOps, reported } from './report-helpers.js';
import {
  agedOf,
  conversationExists,
  day,
  decidedRun,
  draftOf,
  listingExists,
  noticeOf,
  YEAR_MS,
} from './retention-helpers.js';
import {
  amnesty,
  anyArticle,
  appeal,
  dataOf,
  decideStrike,
  staffOf,
  struck,
} from './strike-helpers.js';
import { buildTestApp, repositories, TEST_NOW } from './test-app.js';

/*
 * Spec ops/data-retention cho dữ liệu ngoài tin đăng (thiết bị, hội thoại, thông báo, kết quả máy, gậy, dấu băm email,
 * quyết định) và ops/background-jobs (sổ `job_runs`, lượt dở làm tiếp, bàn vận hành).
 */
const HOUR_MS = 3_600_000;
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

const retention = (options: { budgetMs?: number; pageSize?: number } = {}) =>
  app.modules.ops.runRetention({ budgetMs: 60_000, ...options });
const strikeRow = (id: string) =>
  prisma.strike.findUniqueOrThrow({ where: { id }, include: { appeal: true } });

describe('Dữ liệu thiết bị', () => {
  it('lượt ghi dấu máy 100 ngày còn, hơn 180 ngày xoá; địa chỉ mạng của phiên cũ bị xoá mà phiên và tài khoản vẫn dùng; đánh dấu đã gỡ xoá, đánh dấu đang mở giữ', async () => {
    const user = await newUser(app);
    await repositories.identity.upsertDevicePost({
      deviceHash: 'may-1',
      accountId: user.id,
      at: TEST_NOW,
    });
    const session = await repositories.identity.createSession({
      accountId: user.id,
      refreshTokenHash: `rt-${user.id}-ip`,
      deviceName: 'Điện thoại',
      ip: '203.0.113.9',
      userAgent: 'Ghim/1.0',
      secondFactorAt: null,
      expiresAt: day(400),
      at: TEST_NOW,
    });
    const flag = (clearedAt: Date | null, code: string) =>
      prisma.accountFlag.create({
        data: {
          accountId: user.id,
          kind: 'many_accounts_on_device',
          deviceHash: 'may-1',
          lookupCode: code,
          createdAt: TEST_NOW,
          clearedAt,
          clearedReason: clearedAt ? 'máy mua lại' : null,
        },
      });
    const cleared = await flag(TEST_NOW, 'RTCLEAR01');
    const open = await flag(null, 'RTOPEN001');

    now = day(100);
    await retention();
    expect(await prisma.devicePost.count({ where: { accountId: user.id } })).toBe(1);

    now = day(181);
    const result = await retention();
    expect(result.counts.devices).toBe(3);
    expect(await prisma.devicePost.count({ where: { accountId: user.id } })).toBe(0);
    expect(await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({
      ip: null,
      userAgent: 'Ghim/1.0',
      revokedAt: null,
    });
    expect(await prisma.accountFlag.findUnique({ where: { id: cleared.id } })).toBeNull();
    expect(await prisma.accountFlag.findUnique({ where: { id: open.id } })).not.toBeNull();
    expect(await prisma.account.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      status: 'active',
    });
  });
});

async function talking() {
  const [seller, buyer] = [await newUser(app), await newUser(app)];
  const listing = await seedListing(liveListing(seller.id, await seedCategory()));
  const conversation = await opened(app, buyer, listing.id);
  await sent(app, buyer, conversation.id, 'Còn không?');
  return { seller, buyer, conversation };
}
const remove = (user: TestUser, id: string) =>
  api(app, 'DELETE', `/me/conversations/${id}`, user.token);

describe('Hội thoại', () => {
  it('cả hai bên đã xoá: xoá hẳn cùng tin nhắn; mới một bên xoá: còn và bên kia đọc được', async () => {
    const both = await talking();
    await remove(both.seller, both.conversation.id);
    await remove(both.buyer, both.conversation.id);
    const one = await talking();
    await remove(one.buyer, one.conversation.id);

    now = new Date(TEST_NOW.getTime() + HOUR_MS);
    const result = await retention();
    expect(result.counts.conversations).toBe(1);
    expect(await conversationExists(both.conversation.id)).toBe(false);
    expect(await prisma.message.count({ where: { conversationId: both.conversation.id } })).toBe(0);
    expect(await conversationExists(one.conversation.id)).toBe(true);
    expect(await messagesOf(app, one.seller, one.conversation.id)).toMatchObject([
      { body: 'Còn không?' },
    ]);
    expect(await conversationsOf(app, one.buyer)).toEqual([]);
  });

  it('một năm không ai nhắn: xoá hẳn; 11 tháng: còn', async () => {
    const { conversation } = await talking();
    now = day(330);
    await retention();
    expect(await conversationExists(conversation.id)).toBe(true);
    now = day(366);
    await retention();
    expect(await conversationExists(conversation.id)).toBe(false);
  });
});

describe('Thông báo', () => {
  it('đã gửi 60 ngày còn trong hộp thư; hơn 90 ngày thì không còn', async () => {
    const user = await newUser(app);
    const old = await prisma.notification.create({ data: noticeOf(user.id, TEST_NOW) });
    const recent = await prisma.notification.create({ data: noticeOf(user.id, day(31)) });
    now = day(60);
    await retention();
    expect(await prisma.notification.count({ where: { recipientId: user.id } })).toBe(2);
    now = day(91);
    const result = await retention();
    expect(result.counts.notifications).toBe(1);
    expect(await prisma.notification.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });
});

describe('Kết quả chấm điểm của máy', () => {
  it('quá 180 ngày: kết quả riêng từng tin không còn, số liệu theo luật và dòng tổng vẫn đếm nó; 100 ngày còn nguyên; lượt chưa kết luận và dấu "ảnh chưa kiểm" cùng mốc bị xoá; quyết định của người còn', async () => {
    const user = await newUser(app);
    const listingId = (
      await prisma.listing.create({ data: liveListing(user.id, await seedCategory()) })
    ).id;
    await prisma.screeningRun.createMany({
      data: [
        decidedRun(user.id, { listingId }),
        decidedRun(user.id, { outcome: 'pass_full', cause: 'score', band: 'low', hits: [] }),
        decidedRun(user.id, {
          decidedAt: null,
          outcome: null,
          cause: null,
          score: null,
          band: null,
        }),
        decidedRun(user.id, { startedAt: day(100), decidedAt: day(100) }),
      ],
    });
    await prisma.screeningUncheckedMark.createMany({
      data: [
        { listingId, listingVersion: 2, markedAt: TEST_NOW },
        { listingId, listingVersion: 3, markedAt: day(100) },
      ],
    });
    const decision = await prisma.reviewDecision.create({
      data: {
        listingId,
        actorId: master.id,
        actorRole: 'master',
        outcome: 'pass',
        machineOutcome: 'hold',
        machineHits: ['price_low'],
        machineJudgment: 'machine_overreach',
        taskReasons: ['machine_hold'],
        listingStateAfter: 'live',
        decidedAt: TEST_NOW,
      },
    });

    now = day(181);
    const result = await retention();
    expect(result.counts.screeningRuns).toBe(4);
    expect(await prisma.screeningRun.count({ where: { accountId: user.id } })).toBe(1);
    expect(await prisma.screeningUncheckedMark.count({ where: { listingId } })).toBe(1);
    const stats = await prisma.screeningRunStat.findMany({
      orderBy: [{ outcome: 'asc' }, { ruleCode: 'asc' }],
    });
    expect(stats).toMatchObject([
      { outcome: 'hold', cause: 'score', band: 'high', ruleCode: '*', runs: 1 },
      { outcome: 'hold', ruleCode: 'new_account', runs: 1 },
      { outcome: 'hold', ruleCode: 'price_low', runs: 1 },
      { outcome: 'pass_full', band: 'low', ruleCode: '*', runs: 1 },
    ]);
    expect(stats[0]?.month).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(await prisma.reviewDecision.findUnique({ where: { id: decision.id } })).not.toBeNull();
    expect(await app.modules.review.ruleRates()).toMatchObject(
      expect.arrayContaining([expect.objectContaining({ code: 'price_low' })]),
    );
  });
});

describe('Ẩn danh hoá gậy', () => {
  it('gậy hết hạn / huỷ hơn 2 năm: người nhận thành mã giả, dấu băm email bỏ, lời khiếu nại xoá, quyết định và nhật ký liên quan chỉ còn mã giả; gậy hết hạn 1 năm còn nguyên', async () => {
    const category = await seedCategory();
    const staff = await staffOf(app, [category], ['user_reports']);
    const poster = await newUser(app);
    const first = await struck(app, { staff, poster, categoryId: category, kind: 'normal' });
    const second = await struck(app, { staff, poster, categoryId: category, kind: 'normal' });
    expect((await appeal(app, poster, second.strike.id)).statusCode).toBe(201);
    await reported(app, await newUser(app), aboutAccount(poster.id), 'harassment');
    const byReport = await decideOps(app, staff, aboutAccount(poster.id), {
      outcome: 'keep',
      report: { verdict: 'upheld' },
      strike: { kind: 'normal', ruleArticleId: (await anyArticle()).id },
    });
    expect(byReport.statusCode, byReport.body).toBe(200);
    const thirdId = dataOf<{ strikeId: string }>(byReport).strikeId;
    const pardoned = await amnesty(app, master, poster.id, {
      strikeIds: [first.strike.id],
      reason: 'Hiểu lầm',
    });
    expect(pardoned.statusCode, pardoned.body).toBe(200);
    await deliverAll(app);
    const pseudonym = app.modules.identity.pseudonymOf(poster.id);
    expect(pseudonym).not.toBe(poster.id);

    now = day(91);
    await app.modules.trust.expireStrikes();
    await deliverAll(app);
    now = day(90 + 365);
    await retention();
    expect((await strikeRow(second.strike.id)).accountId).toBe(poster.id);

    now = new Date(day(90).getTime() + 2 * YEAR_MS + 86_400_000);
    const result = await retention();
    expect(result.counts.strikes).toBe(3);
    const rows = await Promise.all([first.strike.id, second.strike.id, thirdId].map(strikeRow));
    for (const row of rows) {
      expect(row).toMatchObject({ accountId: pseudonym, emailHashes: [], anonymizedAt: now });
    }
    expect((await strikeRow(second.strike.id)).appeal).toMatchObject({
      accountId: pseudonym,
      statement: '',
    });
    expect(
      await prisma.reviewDecision.findMany({
        where: { issuedStrikeId: thirdId },
        select: { accountId: true },
      }),
    ).toEqual([{ accountId: pseudonym }]);
    const amnestyAudit = (await auditOf(first.strike.id)).find(
      (row) => row.action === 'trust.strike.amnesty',
    );
    expect(amnestyAudit?.details).toMatchObject({ accountId: pseudonym });
    expect(await app.modules.trust.strikesOf(poster.id)).toEqual([]);
  });

  it('khoá vĩnh viễn hơn 2 năm chưa gỡ: gậy không ẩn danh, dấu băm email giữ và email vẫn bị chặn; gỡ khoá thì lượt kế tiếp bỏ dấu băm và ẩn danh', async () => {
    const category = await seedCategory();
    const staff = await staffOf(app, [category]);
    const poster = await newUser(app);
    // Gậy nghiêm trọng đi qua báo cáo hàng cấm được xác nhận (spec serious-strikes).
    const live = await seedListing(liveListing(poster.id, category));
    await reported(app, await newUser(app), aboutListing(live.id), 'prohibited');
    await deliverAll(app);
    const issued = await decideOps(app, staff, aboutListing(live.id), {
      outcome: 'violation',
      report: { verdict: 'upheld' },
      strike: { kind: 'serious', ruleArticleId: (await anyArticle()).id },
    });
    expect(issued.statusCode, issued.body).toBe(200);
    const strike = { id: dataOf<{ strikeId: string }>(issued).strikeId };
    await deliverAll(app);
    const permanent = await decideStrike(app, master, strike.id, {
      outcome: 'keep',
      serious: { decision: 'permanent' },
    });
    expect(permanent.statusCode, permanent.body).toBe(200);
    await deliverAll(app);
    const [emailHash] = (await strikeRow(strike.id)).emailHashes;
    expect(emailHash).toBeTruthy();

    now = new Date(TEST_NOW.getTime() + 2 * YEAR_MS + 86_400_000);
    await retention();
    expect(await strikeRow(strike.id)).toMatchObject({
      status: 'permanent',
      accountId: poster.id,
      emailHashes: [emailHash],
      anonymizedAt: null,
    });
    expect(await app.modules.trust.isEmailBanned(emailHash ?? '')).toBe(true);

    const reviewer = await signedInAt(app, master, now);
    const lifted = await api(app, 'POST', `/ops/trust/strikes/${strike.id}/lift`, reviewer.token);
    expect(lifted.statusCode, lifted.body).toBe(200);
    await deliverAll(app);
    await retention();
    expect(await strikeRow(strike.id)).toMatchObject({
      status: 'lifted',
      emailHashes: [],
      anonymizedAt: now,
    });
    expect((await strikeRow(strike.id)).accountId).not.toBe(poster.id);
    expect(await app.modules.trust.isEmailBanned(emailHash ?? '')).toBe(false);
    const lockAudit = (await auditOf(poster.id)).find(
      (row) => row.action === 'identity.account.lock',
    );
    expect(lockAudit).toBeUndefined();
    const movedAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'identity.account.lock',
        details: { path: ['strikeId'], equals: strike.id },
      },
    });
    expect(movedAudit?.targetId).toBe((await strikeRow(strike.id)).accountId);
  });
});

describe('Sổ việc nền', () => {
  it('lượt theo lịch ghi "xong" kèm tóm tắt; chạm trần thời gian thì ghi "mới làm được một phần", xếp lượt làm tiếp và lượt đó làm nốt không lặp', async () => {
    const owner = await newUser(app);
    const category = await seedCategory();
    const drafts = await Promise.all([draftOf(owner.id, category), draftOf(owner.id, category)]);
    now = day(8);
    const partial = await retention({ budgetMs: -1, pageSize: 1 });
    expect(partial).toMatchObject({ partial: true, next: 'drafts', counts: { drafts: 1 } });
    expect(jobs.sent).toEqual([
      { name: OPS_JOBS.retentionContinue, data: { from: 'drafts' }, startAfter: undefined },
    ]);
    await jobs.runAll();
    expect(await Promise.all(drafts.map((draft) => listingExists(draft.id)))).toEqual([
      false,
      false,
    ]);
    const continued = await prisma.jobRun.findFirst({
      where: { name: OPS_JOBS.retentionContinue },
    });
    expect(continued).toMatchObject({
      status: 'done',
      summary: expect.objectContaining({ drafts: 1, next: null }),
    });

    const outcome = await jobs.runScheduled(OPS_JOBS.retention);
    expect(outcome).toMatchObject({ partial: false });
    expect(jobs.runs).toMatchObject([
      {
        name: OPS_JOBS.retention,
        status: 'done',
        summary: expect.objectContaining({ drafts: 0, next: null }),
      },
    ]);
  });

  it('GET /ops/jobs/runs: master thấy lượt gần nhất trước, lọc theo tên; người thường 403', async () => {
    const repository = createOpsRepository(prisma);
    await repository.record({
      name: 'media.reconcile',
      status: 'partial',
      startedAt: TEST_NOW,
      finishedAt: day(0),
      summary: { scanned: 1000, next: 'abc' },
      error: null,
    });
    await repository.record({
      name: OPS_JOBS.retention,
      status: 'failed',
      startedAt: day(1),
      finishedAt: day(1),
      summary: {},
      error: 'DB đi vắng',
    });
    const all = await api(app, 'GET', '/ops/jobs/runs', master.token);
    expect(all.statusCode, all.body).toBe(200);
    // Ca trước trong file đã ghi lượt `ops.retention-continue` thật vào sổ — chỉ so hai dòng vừa ghi.
    const rows = (all.json().data as { name: string }[]).filter(
      (row) => row.name !== OPS_JOBS.retentionContinue,
    );
    expect(rows).toMatchObject([
      { name: OPS_JOBS.retention, status: 'failed', error: 'DB đi vắng' },
      { name: 'media.reconcile', status: 'partial', summary: { scanned: 1000, next: 'abc' } },
    ]);
    const filtered = await api(
      app,
      'GET',
      '/ops/jobs/runs?name=media.reconcile&limit=1',
      master.token,
    );
    expect(filtered.json().data).toHaveLength(1);
    const user = await newUser(app);
    expect((await api(app, 'GET', '/ops/jobs/runs', user.token)).statusCode).toBe(403);
  });

  it('một bước hỏng không chặn bước khác: lượt dọn bị cắt vẫn để bước sau cho lượt làm tiếp, không bước nào đặt tin thành hiển thị', async () => {
    const owner = await newUser(app);
    const category = await seedCategory();
    await draftOf(owner.id, category);
    const sold = await agedOf(owner.id, category, { state: 'sold' });
    await reported(app, await newUser(app), aboutListing(sold.id), 'fraud');
    await deliverAll(app);
    now = day(200);
    const result = await retention({ budgetMs: -1 });
    expect(result.partial).toBe(true);
    expect(result.counts.drafts).toBeGreaterThanOrEqual(1);
    await jobs.runAll();
    expect(await listingExists(sold.id)).toBe(true);
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: sold.id } })).toMatchObject({
      state: 'sold',
    });
  });
});
